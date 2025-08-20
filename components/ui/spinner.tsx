import React from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-4 border-solid border-gray-300 border-t-blue-500 h-8 w-8 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
