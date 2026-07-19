import { ShellChrome } from "@/components/shell/ShellChrome";
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <ShellChrome>{children}</ShellChrome>;
}
