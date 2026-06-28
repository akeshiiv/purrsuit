export default function Card({ children, className = '' }) {
  return (
    <section className={`rounded border bg-white p-4 ${className}`}>
      {children}
    </section>
  );
}
