import React from 'react';
import { Button } from '@/components/ui/button';

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44a5.6 5.6 0 0 1-2.42 3.58v3h3.92c2.29-2.11 3.55-5.21 3.55-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.92-3c-1.08.73-2.47 1.16-4.01 1.16-3.09 0-5.71-2.09-6.64-4.89H1.31v3.09C3.28 21.31 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.36 14.36a7.2 7.2 0 0 1 0-4.71V6.65H1.31a12 12 0 0 0 0 10.7l4.05-2.99z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.45-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.28 2.69 1.31 6.65l4.05 3C6.29 6.84 8.91 4.75 12 4.75z" />
  </svg>
);

export default function GoogleButton({ label = 'Continue with Google', onClick, disabled }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2.5 font-medium"
      onClick={onClick}
      disabled={disabled}
    >
      <GoogleMark />
      {label}
    </Button>
  );
}