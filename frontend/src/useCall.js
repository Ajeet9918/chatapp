
import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
];

export function useCall(socket, conversationId, currentUser) {
  const [callState, setCallState] = useState('idle'); 
  const [callType, setCallType] = useState('audio'); 
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const pcRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // ---------- Helpers ----------

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', { conversationId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup();
      }
    };

    return pc;
  }

  async function getLocalStream(type) {
    const constraints = type === 'video'
      ? { audio: true, video: { width: 640, height: 480 } }
      : { audio: true, video: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  function cleanup() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current.getTracks().forEach((t) => remoteStreamRef.current.removeTrack(t));
    setCallState('idle');
    setIncomingFrom(null);
  }

  // ---------- Outgoing call ----------

  const startCall = useCallback(async (type = 'audio') => {
    try {
      setError(null);
      setCallType(type);
      setCallState('calling');

      const stream = await getLocalStream(type);
      const pc = createPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:invite', { conversationId, callType: type });
      socket.emit('call:offer', { conversationId, sdp: offer });
    } catch (e) {
      setError(e.message);
      cleanup();
    }
  }, [socket, conversationId]);

  const acceptCall = useCallback(async () => {
    try {
      setError(null);
      const stream = await getLocalStream(callType);
      const pc = pcRef.current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { conversationId, sdp: answer });

      setCallState('connected');
    } catch (e) {
      setError(e.message);
      cleanup();
    }
  }, [socket, conversationId, callType]);

  const rejectCall = useCallback(() => {
    socket.emit('call:reject', { conversationId });
    cleanup();
  }, [socket, conversationId]);

  const endCall = useCallback(() => {
    socket.emit('call:end', { conversationId });
    cleanup();
  }, [socket, conversationId]);

  useEffect(() => {
    if (!socket) return;

    async function onInvite({ callType: type, fromUsername }) {
      setCallType(type);
      setIncomingFrom(fromUsername);
      setCallState('incoming');
      pcRef.current = createPeerConnection();
    }

    async function onOffer({ sdp }) {
      if (!pcRef.current) pcRef.current = createPeerConnection();
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async function onAnswer({ sdp }) {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setCallState('connected');
      }
    }

    async function onIceCandidate({ candidate }) {
      if (pcRef.current && candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          // benign if it arrives before remote description is set
        }
      }
    }

    function onEnd() {
      cleanup();
    }

    function onReject() {
      cleanup();
    }

    socket.on('call:invite', onInvite);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:end', onEnd);
    socket.on('call:reject', onReject);

    return () => {
      socket.off('call:invite', onInvite);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:end', onEnd);
      socket.off('call:reject', onReject);
    };
  }, [socket]);

  // Cleanup on unmount / conversation change
  useEffect(() => {
    return () => cleanup();
  }, [conversationId]);

  return {
    callState,
    callType,
    incomingFrom,
    error,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall
  };
}
