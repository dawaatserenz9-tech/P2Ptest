let ws;
let pc;
let localStream;

// Google-ийн олон нийтийн STUN серверүүд
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function logMessage(msg) {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<div>${msg}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

// 1. Програм ачаалагдах үед вебкамерынхаа дүрс болон дууг шууд асаах
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
        logMessage('System: Local camera stream captured successfully');
    } catch (err) {
        console.error('Error accessing media devices.', err);
        logMessage('System Error: Cannot access camera/microphone');
    }
}

// Хуудас ачаалагдахад камер руу хандах
window.onload = () => {
    startCamera();
};

// 2. WebSocket Signaling серверт холбогдох
document.getElementById('connectServerBtn').onclick = () => {
    const wsUrl = document.getElementById('wsServerInput').value;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        logMessage('System: Connected to signaling server');
        document.getElementById('startCallBtn').disabled = false;
    };

    ws.onerror = (error) => {
        logMessage('System Error: WebSocket connection failed');
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (!pc) createPeerConnection();

        if (data.sdp) {
            const sdp = data.sdp;
            try {
                if (sdp.type === 'offer') {
                    if (pc.signalingState !== "stable") {
                        console.warn("Skipping offer, current state:", pc.signalingState);
                        return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    ws.send(JSON.stringify({ sdp: pc.localDescription }));
                    logMessage('System: Answer sent');
                } 
                else if (sdp.type === 'answer') {
                    if (pc.signalingState === "have-local-offer") {
                        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                        logMessage('System: Remote description (answer) set successfully');
                    } else {
                        console.log("Connection is already stable or state is:", pc.signalingState);
                    }
                }
            } catch (err) {
                console.error("Failed to handle SDP:", err);
            }
        } else if (data.candidate) {
            try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    };
};

// 3. WebRTC Peer Connection үүсгэх функц
function createPeerConnection() {
    pc = new RTCPeerConnection(configuration);

    // Өөрийн камерын урсгалыг холболт руу нэмэх
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Нөгөө талаас ирж буй видеог дэлгэцэнд гаргах
    pc.ontrack = (event) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            logMessage('System: Remote video stream received!');
            remoteVideo.play().catch(e => console.error("Remote video play error:", e));
        }
    };

    // ICE Candidate солилцох
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ candidate: event.candidate }));
        }
    };
}

// 4. Дуудлага эхлүүлэх товч
document.getElementById('startCallBtn').onclick = async () => {
    if (!localStream) {
        alert('Камерын зөвшөөрөл олгогдоогүй эсвэл камер олдохгүй байна!');
        return;
    }

    createPeerConnection();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ sdp: pc.localDescription }));
    logMessage('System: Offer sent');
};