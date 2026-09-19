import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog.jsx";

// 每个业务面板持有一个确认框；关闭、重复请求或卸载均不会执行危险操作。
export default function useConfirm() {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  const cancelButton = useRef(null);
  const ask = useCallback((message, options = {}) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      pending.current = resolve;
      setRequest({ message, title: "确认操作", label: "确认继续", ...options });
    });
  }, []);
  const finish = useCallback((accepted) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  useEffect(() => () => {
    pending.current?.(false);
    pending.current = null;
  }, []);

  const confirmation = request && (
    <Dialog open onOpenChange={(open) => !open && finish(false)}>
      <DialogContent className="app-dialog confirm-dialog" initialFocus={cancelButton} forceBackdrop>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.message}</DialogDescription>
        <div className="actions">
          <button ref={cancelButton} className="outline" onClick={() => finish(false)}>取消</button>
          <button className={request.danger ? "primary confirm-danger" : "primary"} onClick={() => finish(true)}>{request.label}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
  return [ask, confirmation];
}
