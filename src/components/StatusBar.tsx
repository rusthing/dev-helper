import { ShieldCheck } from "lucide-react";
import { TOOLS } from "../lib/tools";

export function StatusBar() {
  return (
    <footer className="statusbar">
      <span className="sb-item">
        <ShieldCheck size={12} /> 全离线 · 数据不出本机
      </span>
      {/* 别写死数字：加工具那一步最容易被忘掉 */}
      <span className="sb-item">{TOOLS.length} 个工具</span>
      <span className="sb-item" style={{ marginLeft: "auto" }}>
        Rust + Tauri
      </span>
    </footer>
  );
}
