import { Button } from "@base-ui/react/button";

// 共用图标按钮，交互反馈由业务样式统一管理。
export function IconButton({ className = "", ...props }) {
  return (
    <Button data-slot="button" className={`icon-button ${className}`} {...props} />
  );
}
