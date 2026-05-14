import { useEffect, useRef, useState } from 'react';

export default function WipeScreen({ progress, onQuit }) {
  return (
    <div className="screen wipe-screen">
      <div className="screen-top-row">
        <button className="quit-btn" onClick={onQuit}>✕</button>
      </div>
      <div className="wipe-label">Clearing...</div>
      <div className="wipe-bar-wrap">
        <div className="wipe-bar" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
