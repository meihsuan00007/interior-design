import { FadeIn } from "@/components/motion/fade-in";

/** template 在每次換頁都會重新掛載，頁面內容因此淡入。 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}
