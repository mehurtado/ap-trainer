import React from 'react';

export default function WipeScreen({ progress }) {
  return (
    <div className="screen wipe-screen">
      <div className="wipe-label">Clearing...</div>
      <div className="wipe-bar-wrap">
        <div className="wipe-bar" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
