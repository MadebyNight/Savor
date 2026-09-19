import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

const layers = [];

function handleBack(event) {
  // 同级按打开顺序返回；弹窗始终优先于页面。
  const top = layers.reduce((last, layer) =>
    !last || layer.priority >= last.priority ? layer : last, null);
  if (!top) return;
  event.preventDefault();
  // 原生可能连续发出返回事件，在下一次事件前完成层级注销。
  flushSync(() => top.close.current());
}

export default function useBackHandler(active, onBack, priority = 0) {
  const close = useRef(onBack);
  useLayoutEffect(() => { close.current = onBack; });
  useLayoutEffect(() => {
    if (!active) return;
    const layer = { close, priority };
    if (!layers.length) window.addEventListener("shiguang:back", handleBack);
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
      if (!layers.length) window.removeEventListener("shiguang:back", handleBack);
    };
  }, [active, priority]);
}
