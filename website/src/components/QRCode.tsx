'use client';

import { useRef, useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * QRCode Component for AgentID
 *
 * Usage:
 * <QRCode identityHash="0x123..." size={256} />
 * <QRCode identityHash="0x123..." size={512} downloadable />
 */

interface QRCodeProps {
  identityHash: string;
  size?: number;
  showUrl?: boolean;
  downloadable?: boolean;
  className?: string;
}

const SITE_URL = 'https://id-agent.org';
const QR_COLOR = '#000000';
const BG_COLOR = '#ffffff';
const ACCENT_COLOR = '#22c55e';

export default function QRCode({
  identityHash,
  size = 256,
  showUrl = true,
  downloadable = false,
  className = ''
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const url = `${SITE_URL}/verify/${identityHash}`;
    setQrUrl(url);
  }, [identityHash]);

  const downloadQR = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `agent-${identityHash.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (!qrUrl) return null;

  return (
    <div className={`inline-flex flex-col items-center gap-4 ${className}`}>
      <div
        className="relative bg-white p-6 rounded-lg border-2 border-green-500/20 shadow-lg"
        style={{ padding: size > 256 ? '24px' : '16px' }}
      >
        {/* QR Code Canvas */}
        <div className="relative">
          <QRCodeCanvas
            ref={canvasRef}
            value={qrUrl}
            size={size}
            level="H" // High error correction
            bgColor={BG_COLOR}
            fgColor={QR_COLOR}
            includeMargin={false}
            // Logo can be added later with imageSettings
            // imageSettings={{
            //   src: '/logo-a.png',
            //   height: size * 0.15,
            //   width: size * 0.15,
            //   excavate: true,
            // }}
          />
        </div>

        {/* URL Label */}
        {showUrl && (
          <div
            className="mt-4 text-center font-mono font-bold"
            style={{
              fontSize: size > 256 ? '16px' : '12px',
              color: ACCENT_COLOR
            }}
          >
            id-agent.org
          </div>
        )}
      </div>

      {/* Download Button */}
      {downloadable && (
        <button
          onClick={downloadQR}
          className="px-6 py-2 bg-green-500 hover:bg-green-600 text-black font-mono font-bold rounded-lg transition-colors shadow-md hover:shadow-lg"
          aria-label="Download QR Code"
        >
          Download QR Code
        </button>
      )}

      {/* Accessibility: Hidden text for screen readers */}
      <span className="sr-only">
        QR Code linking to {qrUrl}
      </span>
    </div>
  );
}

/**
 * QRCode Component - Compact Version
 * For use in cards, lists, etc.
 */
export function QRCodeCompact({
  identityHash,
  size = 128,
  className = ''
}: Omit<QRCodeProps, 'showUrl' | 'downloadable'>) {
  const qrUrl = `${SITE_URL}/verify/${identityHash}`;

  return (
    <div className={`inline-block ${className}`}>
      <QRCodeCanvas
        value={qrUrl}
        size={size}
        level="M"
        bgColor={BG_COLOR}
        fgColor={QR_COLOR}
        includeMargin={false}
      />
    </div>
  );
}

/**
 * Performance: Memoized QR Code for lists
 */
export const MemoizedQRCode = QRCode;
