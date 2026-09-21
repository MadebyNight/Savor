import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  getPreference,
  loadRecognitionDraft,
  saveRecognitionDraft,
} from "../storage.js";
import { getDeveloperConfig } from "../developer-ai.js";
import { defaultAI, resolveAIEndpoint, recognize } from "../services.js";
import { fetchArticle } from "../links.js";
import { normalizeAIDrafts } from "../validation.js";
import DraftEditor from "./DraftEditor.jsx";
import useConfirm from "./useConfirm.jsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";
export default function RecognitionPanel({
  mode,
  initialImage,
  onSettings,
  onImportRecipes,
  onImportStock,
}) {
  const albumInput = useRef(null),
    cameraInput = useRef(null),
    running = useRef(false);
  const [readingImage, setReadingImage] = useState(false);
  const [ask, confirmation] = useConfirm();
  const [effectiveConfig, setConfig] = useState(defaultAI);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const endpoint = (() => {
    try {
      return resolveAIEndpoint(effectiveConfig.url);
    } catch {
      return "";
    }
  })();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [image, setImage] = useState("");
  const kind = mode === "stock" ? "stock" : "recipes";
  const [draft, setDraft] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const draftResult = (() => {
    try {
      return { items: normalizeAIDrafts(JSON.parse(draft || "[]"), kind) };
    } catch (error) {
      return { items: [], error: error.message };
    }
  })();
  const draftItems = draftResult.items;
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function selectImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("请选择10MB以内图片");
    setReadingImage(true);
    const current = generation.current;
    try {
      const value = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reader.onabort = () =>
          reject(new Error("图片读取失败，请重新从相册选择或拍摄"));
        reader.readAsDataURL(file);
      });
      if (current !== generation.current) return;
      setImage(value);
      await persist(draft, { image: value });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setReadingImage(false);
    }
  }

  const persist = (value = draft, patch = {}) =>
    saveRecognitionDraft(mode, { text, image, kind, draft: value, ...patch });
  useEffect(() => {
    let active = true;
    setReady(false);
    Promise.all([getPreference("ai-config", defaultAI), getDeveloperConfig()])
      .then(([saved, developer]) => {
        if (active) setConfig(developer || saved);
      })
      .catch(() => {
        if (active) setLoadError("AI 配置读取失败");
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    loadRecognitionDraft(mode)
      .then(async (value) => {
        if (initialImage) {
          value = { ...value, image: initialImage };
          await saveRecognitionDraft(mode, value);
        }
        if (active) {
          setText(value.text || "");
          setImage(value.image || "");
          setDraft(value.draft || "");
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setLoadError("识别草稿读取失败");
      });
    return () => {
      active = false;
    };
  }, [mode, initialImage]);
  async function run() {
    if (running.current) return;
    running.current = true;
    const current = ++generation.current;
    try {
      if (!text.trim() && !image) return toast.error("请粘贴文字或选择图片");
      if (
        !(await ask(
          "将把当前文字和图片发送到 " +
            (endpoint || effectiveConfig.url) +
            " 进行识别，可能产生服务商费用。",
          { title: "发送给 AI 识别？", label: "同意发送" },
        ))
      )
        return;
      if (
        draft &&
        draft !== "[]" &&
        !(await ask("新识别将替换当前未保存的识别草稿。", {
          title: "替换识别草稿？",
          label: "替换并识别",
          danger: true,
        }))
      )
        return;
      if (current !== generation.current) return;
      setBusy(true);
      try {
        await persist();
        if (current !== generation.current) return;
        const items = await recognize(effectiveConfig, text, image, kind);
        if (current !== generation.current) return;
        const value = JSON.stringify(items, null, 2);
        setDraft(value);
        await persist(value);
        if (current !== generation.current) return;
        setReviewError("");
        setReviewOpen(true);
      } catch (e) {
        if (current === generation.current) {
          setReviewError(e.message);
          setReviewOpen(true);
        }
      } finally {
        if (current === generation.current) setBusy(false);
      }
    } finally {
      if (current === generation.current) running.current = false;
    }
  }
  async function saveItems(items) {
    if (kind === "stock")
      await onImportStock(
        items.map((i) => ({
          ...i,
          id: crypto.randomUUID(),
          date: new Date().toLocaleDateString("sv-SE"),
        })),
      );
    else
      await onImportRecipes(
        items.map((i) => ({ ...i, id: crypto.randomUUID() })),
      );
  }
  return (
    <div className="panel settings-panel recognition-panel">
      <section className="settings-page" aria-label="识别">
        <h2>
          {mode === "stock"
            ? "拍照识别食材"
            : mode === "recipe-image"
              ? "图文识别菜谱"
              : "正文识别菜谱"}
        </h2>
        <button
          className="text-link"
          disabled={busy || readingImage || fetching}
          onClick={onSettings}
        >
          AI 配置
        </button>
        {loadError && (
          <p role="alert">{loadError}。请返回后重试，原草稿未修改。</p>
        )}
        <fieldset disabled={!ready || loadingConfig || !!loadError}>
          {(mode !== "recipe-text" || image) && (
            <>
              <div className="image-source-actions">
                <button
                  className="outline"
                  disabled={busy || readingImage}
                  onClick={() => albumInput.current.click()}
                >
                  <ImagePlus size={20} aria-hidden="true" />
                  相册选择
                </button>
                <button
                  className="outline"
                  disabled={busy || readingImage}
                  onClick={() => cameraInput.current.click()}
                >
                  <Camera size={20} aria-hidden="true" />
                  拍摄
                </button>
                <input
                  ref={albumInput}
                  hidden
                  aria-label="从相册选择图片"
                  disabled={busy || readingImage}
                  type="file"
                  accept="image/*"
                  onChange={selectImage}
                />
                <input
                  ref={cameraInput}
                  hidden
                  aria-label="拍摄图片"
                  disabled={busy || readingImage}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={selectImage}
                />
              </div>
              <p className="subtle">
                可选择菜谱截图或购物小票，单张不超过
                10MB。确认发送后，才会交给当前 AI 服务识别。
              </p>
              {readingImage && <p role="status">正在读取图片…</p>}
              {image && (
                <div className="recognition-image">
                  <img src={image} alt="待识别图片" />
                  <button
                    className="outline"
                    disabled={busy || readingImage}
                    onClick={async () => {
                      setImage("");
                      try {
                        await persist(draft, { image: "" });
                      } catch (e) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    移除图片
                  </button>
                </div>
              )}
            </>
          )}
          {(mode === "recipe-text" || text) && (
            <>
              {mode === "recipe-text" && (
                <>
                  <label>
                    公开链接（可粘贴小红书分享文字）
                    <input
                      disabled={busy || fetching || readingImage}
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                  </label>
                  <button
                    className="outline"
                    disabled={busy || fetching || readingImage || !link.trim()}
                    onClick={async () => {
                      if (
                        text &&
                        !(await ask("取得正文后会替换当前输入文字。", {
                          title: "替换输入正文？",
                          label: "获取并替换",
                        }))
                      )
                        return;
                      setFetching(true);
                      const current = generation.current;
                      try {
                        const article = await fetchArticle(link);
                        if (current !== generation.current) return;
                        const content = article.title + "\n" + article.text;
                        setText(content);
                        await persist(draft, { text: content });
                        toast.success("已提取公开正文，请核对后再发送识别");
                      } catch (e) {
                        toast.error(e.message);
                      } finally {
                        setFetching(false);
                      }
                    }}
                  >
                    {fetching ? "正在获取正文…" : "获取公开正文"}
                  </button>
                  <p className="subtle">
                    需要登录或无法读取的页面，请粘贴正文或上传截图。获取正文不会自动发送给
                    AI。
                  </p>
                </>
              )}
              <textarea
                disabled={busy || readingImage}
                aria-label="识别原文"
                rows={5}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  persist(draft, { text: e.target.value }).catch(() =>
                    toast.error("草稿保存失败，请重试"),
                  );
                }}
                placeholder="粘贴菜谱正文，或先通过上方链接获取公开正文"
              />
            </>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={busy || readingImage || loadingConfig}
              onClick={run}
            >
              {busy ? "正在识别…" : "确认发送并识别"}
            </button>
            {busy && (
              <button
                className="outline"
                onClick={() => {
                  generation.current++;
                  running.current = false;
                  setBusy(false);
                  toast("已停止等待，服务端可能仍在处理");
                }}
              >
                取消等待
              </button>
            )}
            <button
              className="outline"
              disabled={readingImage}
              onClick={() =>
                persist()
                  .then(() => toast.success("草稿已保存"))
                  .catch((e) => toast.error(e.message))
              }
            >
              保存草稿
            </button>
          </div>
          {draftItems.length > 0 && (
            <button
              className="outline"
              disabled={busy}
              onClick={() => {
                setReviewError("");
                setReviewOpen(true);
              }}
            >
              查看待保存草稿（{draftItems.length} 项）
            </button>
          )}
          {draftResult.error && (
            <button
              className="outline"
              disabled={busy}
              onClick={() => {
                setReviewError(
                  "已有草稿格式异常：" +
                    draftResult.error +
                    "。原文和草稿仍保留，可以重新识别。",
                );
                setReviewOpen(true);
              }}
            >
              查看异常草稿说明
            </button>
          )}
        </fieldset>
      </section>
      {reviewOpen && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !savingDraft) setReviewOpen(false);
          }}
        >
          <DialogContent
            className="app-dialog ai-review-dialog"
            forceBackdrop
            aria-busy={savingDraft}
          >
            <DialogTitle>
              {reviewError
                ? "识别未完成"
                : draftItems.length
                  ? kind === "stock"
                    ? "核对并保存食材"
                    : "核对并保存菜谱"
                  : "未识别到可保存内容"}
            </DialogTitle>
            <DialogDescription>
              {reviewError
                ? "原文和已有草稿保留，请检查后重试。"
                : draftItems.length
                  ? "以下内容尚未入库，请核对后确认保存。关闭窗口会保留草稿。"
                  : "可以补充菜谱正文、换一张清晰图片，或手动录入。"}
            </DialogDescription>
            {reviewError ? (
              <>
                <p role="alert">{reviewError}</p>
                <button
                  className="primary"
                  onClick={() => setReviewOpen(false)}
                >
                  返回检查
                </button>
              </>
            ) : draftItems.length ? (
              <DraftEditor
                items={draftItems}
                kind={kind}
                onSavingChange={setSavingDraft}
                onDefer={() => setReviewOpen(false)}
                onChange={async (items) => {
                  const value = JSON.stringify(items);
                  setDraft(value);
                  try {
                    await persist(value);
                    if (!items.length) setReviewOpen(false);
                  } catch (e) {
                    toast.error(e.message);
                  }
                }}
                onSave={saveItems}
              />
            ) : (
              <button className="primary" onClick={() => setReviewOpen(false)}>
                返回补充
              </button>
            )}
          </DialogContent>
        </Dialog>
      )}
      {confirmation}
    </div>
  );
}
