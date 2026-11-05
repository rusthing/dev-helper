import {
  Circle,
  Fingerprint,
  GitCompare,
  Hash,
  Lock,
  QrCode,
  Regex,
  Type,
  Wrench,
} from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * 显式映射表：只把用到的图标打进包里。
 * 用 `import { icons }` 全量字典会让 bundle 多出 900KB。
 */
const MAP: Record<string, LucideIcon> = {
  Fingerprint,
  GitCompare,
  Hash,
  Lock,
  QrCode,
  Regex,
  Type,
  Wrench,
};

export function Icon({ name, ...rest }: { name: string } & LucideProps) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp {...rest} />;
}
