import "./styles.css";
import { LanguageProvider } from "../components/language";
export const metadata = {
  title: "Hikmah Institute | Academic Office",
  description: "Academic management, attendance and results",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
