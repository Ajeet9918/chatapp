import React, { useState } from 'react';

export default function CallPanel({ call }) {
  const {
    callState, callType, incomingFrom, error,
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, endCall
  } = call;

  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  function toggleMute() {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((t) => (t.enabled = muted));
      setMuted(!muted);
    }
  }

  function toggleVideo() {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = videoOff));
      setVideoOff(!videoOff);
    }
  }

  if (callState === 'idle') {
    return (
      <div className="call-buttons">
        <button className="call-btn" onClick={() => startCall('audio')} title="Voice call">
          📞
        </button>
        <button className="call-btn" onClick={() => startCall('video')} title="Video call">
          🎥
        </button>
      </div>
    );
  }

  return (
    <div className="call-overlay">
      {error && <div className="error">{error}</div>}

      {callState === 'incoming' && (
        <div className="call-card">
          <h3>{incomingFrom} is calling ({callType})...</h3>
          <div className="call-actions">
            <button className="accept-btn" onClick={acceptCall}>Accept</button>
            <button className="reject-btn" onClick={rejectCall}>Decline</button>
          </div>
        </div>
      )}

      {callState === 'calling' && (
        <div className="call-card">
          <h3>Calling... ({callType})</h3>
          <button className="reject-btn" onClick={endCall}>Cancel</button>
        </div>
      )}

      {(callState === 'connected' || callState === 'calling' || callState === 'incoming') && (
        <div className="call-video-area">
          {callType === 'video' && (
            <>
              <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
              <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
            </>
          )}
          {callType === 'audio' && (
            <>
              {/* Hidden elements still needed to play audio streams */}
              <video ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
              <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />
              <div className="audio-call-indicator">🔊 Audio call in progress...</div>
            </>
          )}
        </div>
      )}

      {callState === 'connected' && (
        <div className="call-controls">
          <button className="control-btn" onClick={toggleMute}>{muted ? '🔇 Unmute' : '🎙️ Mute'}</button>
          {callType === 'video' && (
            <button className="control-btn" onClick={toggleVideo}>{videoOff ? '📷 Camera On' : '📷 Camera Off'}</button>
          )}
          <button className="reject-btn" onClick={endCall}>End Call</button>
        </div>
      )}
    </div>
  );
}
