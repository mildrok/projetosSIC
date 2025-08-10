export const metadata = {
  title: "Gestão de Projetos",
  description: "MVP para gerir projetos com timeline, histórico e resumos"
};
export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body style={{fontFamily:'Inter, system-ui, Arial', background:'#f6f7fb', color:'#0f172a'}}>
        {children}
      </body>
    </html>
  );
}