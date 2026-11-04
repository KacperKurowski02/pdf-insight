import { useCallback, useRef, useState } from 'react';

interface DropzoneProps {
  onFile: (file: File) => void;
  disabled: boolean;
}

export function Dropzone({ onFile, disabled }: DropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-label="Wgraj plik PDF. Przeciagnij go tutaj albo nacisnij Enter, aby wybrac z dysku."
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) {
          onFile(file);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = '';
        }}
      />
      <p className="dropzone__title">Przeciagnij plik PDF albo kliknij, aby wybrac</p>
      <p className="dropzone__hint">Tylko PDF z warstwa tekstowa, maksymalnie 10 MB</p>
    </div>
  );
}
