import "./styles.css";
export const metadata = {
  title: "Hikmah Institute | Academic Office",
  description: "Academic management, attendance and results",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
