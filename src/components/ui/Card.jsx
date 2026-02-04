"use client";

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-gray-800/50 border border-gray-700/50 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }) {
  return <div className={`px-4 py-3 border-b border-gray-700/50 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = "" }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
