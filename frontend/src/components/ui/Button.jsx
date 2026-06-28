export default function Button({
  children,
  className = '',
  type = 'button',
  variant = 'primary',
  ...props
}) {
  const variants = {
    primary: 'border-blue-700 bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
    danger: 'border-red-700 bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <button
      className={`rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
