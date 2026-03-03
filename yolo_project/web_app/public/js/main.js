const API_URL = 'http://localhost:3000/api';
const token = localStorage.getItem('token');

if (!token) {
    window.location.href = 'index.html';
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- COMPARISON MODAL LOGIC (Shared) ---
let currentOriginal = '';
let currentTagged = '';
let isShowingTagged = false;

function openModal(original, tagged) {
    currentOriginal = original;
    currentTagged = tagged;
    isShowingTagged = false; // Start with raw
    updateSlide();
    document.getElementById('image-modal').style.display = 'block';
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function closeModal() {
    document.getElementById('image-modal').style.display = 'none';
}

// --- UI LOGIC (Dropdowns & Theme) ---

// Window OnClick (Handles Modal Closing)
window.onclick = function (event) {
    // Modal Close Logic
    const modal = document.getElementById('image-modal');
    if (event.target == modal) {
        closeModal();
    }
}

// Theme Logic
const themeToggleBtn = document.getElementById('theme-toggle');

function setTheme(isLight) {
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');

    if (isLight) {
        document.body.classList.add('light-mode');
        // Show Moon (to switch back to dark)
        if (sunIcon && moonIcon) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-mode');
        // Show Sun (to switch to light)
        if (sunIcon && moonIcon) {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
        localStorage.setItem('theme', 'dark');
    }

    // Update Charts if they exist
    const newColor = isLight ? '#000000' : '#ffffff';

    if (window.userChartInstance) {
        window.userChartInstance.options.plugins.legend.labels.color = newColor;
        window.userChartInstance.update();
    }
    if (window.adminChartInstance) {
        window.adminChartInstance.options.plugins.legend.labels.color = newColor;
        window.adminChartInstance.update();
    }
}

// Init Theme (Default: Light Mode)
const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme !== 'dark');

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.body.classList.contains('light-mode');
        setTheme(!isLight);
    });
}

// Show Admin Button if User is Admin
function checkAdminAccess() {
    const adminBtn = document.getElementById('admin-nav-btn');
    if (adminBtn && localStorage.getItem('isAdmin') === 'true') {
        adminBtn.style.display = 'flex';
    }
}
checkAdminAccess();

// Load User Info for Navbar
async function loadNavInfo() {
    // Only if logged in
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
        // We might just use local storage for simple name display if available
        // But let's try to fetch if we have an endpoint or just parse JWT
        // Simply use "User" as fallback or parsed locally if we stored it
        // Ideally we would fetch `/api/user/profile` or similar to get name.
        // Let's assume we can fetch profile easily.
        try {
            const res = await fetch(`${API_URL}/user/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const navName = document.getElementById('nav-username');
                if (navName) navName.innerText = data.user.username;
            }
        } catch (e) { }
    }
}
loadNavInfo();

// --- PROFILE PAGE LOGIC ---
if (window.location.pathname.includes('profile.html')) {
    async function loadProfile() {
        const res = await fetch(`${API_URL}/user/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return; // redirect or show error

        const data = await res.json();

        // Fill Info
        document.getElementById('profile-name').innerText = data.user.username;
        document.getElementById('profile-email').innerText = data.user.email;
        document.getElementById('profile-joined').innerText = `Joined: ${new Date(data.user.createdAt).toLocaleDateString()}`;
        document.getElementById('profile-total').innerText = data.totalUploads;

        // Update Severity Counts
        if (data.severityStats) {
            document.getElementById('count-low').innerText = data.severityStats.Low;
            document.getElementById('count-medium').innerText = data.severityStats.Medium;
            document.getElementById('count-high').innerText = data.severityStats.High;
        }

        // Table

        const tbody = document.getElementById('profile-activity-table');
        tbody.innerHTML = '';
        data.recentActivity.forEach(item => {
            const tr = document.createElement('tr');
            // Format: Result (with view) | Confidence | Date
            const percentage = (item.confidence * 100).toFixed(0) + '%';

            tr.innerHTML = `
                <td>
                    ${item.label} 
                    <button class="view-btn" style="margin-left:5px">View</button>
                </td>
                <td>${percentage}</td>
                <td>${new Date(item.createdAt).toLocaleString()}</td>
            `;

            const btn = tr.querySelector('.view-btn');
            btn.onclick = () => openModal(item.originalImagePath, item.taggedImagePath);

            tbody.appendChild(tr);
        });

        // Chart
        const ctx = document.getElementById('userChart').getContext('2d');

        // Destroy existing
        if (window.userChartInstance) window.userChartInstance.destroy();

        window.userChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(data.categories),
                datasets: [{
                    data: Object.values(data.categories),
                    backgroundColor: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
                    borderColor: '#0b1c11'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: document.body.classList.contains('light-mode') ? '#064e3b' : '#e2f1e6'
                        }
                    }
                }
            }
        });
    }

    loadProfile();
}


// --- COMPARISON MODAL LOGIC (Shared) ---

function nextSlide() {
    isShowingTagged = !isShowingTagged;
    updateSlide();
}

function prevSlide() {
    isShowingTagged = !isShowingTagged;
    updateSlide();
}

function updateSlide() {
    const img = document.getElementById('modal-img');
    const label = document.getElementById('modal-label');

    if (isShowingTagged) {
        img.src = currentTagged;
        label.innerText = "Detected (After)";
    } else {
        img.src = currentOriginal;
        label.innerText = "Raw Image (Before)";
    }
}

// Close modal when clicking outside
// Close modal when clicking outside - HANDLED ABOVE IN MAIN WINDOW.ONCLICK


// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW Registered!', reg.scope);
        }).catch(err => console.log('SW Registration Failed', err));
    });
}

// --- USER DASHBOARD ---
if (window.location.pathname.includes('dashboard.html')) {

    // Elements
    const uploadBtnTrigger = document.getElementById('upload-btn-trigger');
    const cameraBtn = document.getElementById('camera-btn');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    // Camera Elements
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');

    let stream = null;

    // Toggle Upload
    if (uploadBtnTrigger) {
        uploadBtnTrigger.addEventListener('click', () => {
            uploadZone.style.display = 'block';
            cameraContainer.style.display = 'none';
            stopCamera();
        });

        // Use upload zone click
        uploadZone.addEventListener('click', () => fileInput.click());
    }

    // Toggle Camera
    if (cameraBtn) {
        cameraBtn.addEventListener('click', async () => {
            uploadZone.style.display = 'none';
            cameraContainer.style.display = 'block';
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                video.srcObject = stream;
            } catch (err) {
                alert("Camera access denied or not available.");
                console.error(err);
            }
        });
    }

    // Close Camera
    if (closeCameraBtn) {
        closeCameraBtn.addEventListener('click', () => {
            stopCamera();
            cameraContainer.style.display = 'none';
        });
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    }

    // Capture Photo
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to Blob and Upload
            canvas.toBlob(async (blob) => {
                const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
                stopCamera();
                cameraContainer.style.display = 'none';

                // Show preview immediately
                const preview = document.getElementById('preview-image');
                preview.src = URL.createObjectURL(blob);
                document.getElementById('result-display').style.display = 'block';
                document.getElementById('result-text').innerText = 'Analyzing...';

                await uploadImage(file);
            }, 'image/jpeg');
        });
    }

    // Reusable Upload Function
    async function uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch(`${API_URL}/predict`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                const severity = data.severity || 'Low';
                const badgeClass = `badge-${severity.toLowerCase()}`;

                // Show count or 'No Waste'
                const countText = data.totalItems === 0 ? 'No Waste Detected' : `${data.totalItems} items`;

                const resultText = document.getElementById('result-text');
                resultText.innerHTML = `
                    Detected: ${data.label} (${(data.confidence * 100).toFixed(1)}%)
                    <br>
                    <span class="severity-badge ${badgeClass}" style="margin-left: 0; margin-top: 10px; display: inline-block;">
                        Severity: ${severity} (${countText})
                    </span>
                `;

                if (data.tagged_image_url) {
                    document.getElementById('preview-image').src = data.tagged_image_url;
                }

                loadHistory();
            } else {
                document.getElementById('result-text').innerText = `Error: ${data.error}`;
            }
        } catch (err) {
            console.error(err);
            document.getElementById('result-text').innerText = 'Server Error.';
        }
    }

    // File Input Change (Existing Logic adapted)
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('preview-image').src = e.target.result;
            document.getElementById('result-display').style.display = 'block';
            document.getElementById('result-text').innerText = 'Analyzing...';
        };
        reader.readAsDataURL(file);

        uploadImage(file);
    });

    // Load History
    async function loadHistory() {
        try {
            const res = await fetch(`${API_URL}/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            const historyList = document.getElementById('history-list');
            if (!historyList) return;

            historyList.innerHTML = '';

            data.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';

                // Format: Label | Percentage | Button
                const percentage = (item.confidence * 100).toFixed(0) + '%';
                const labelText = item.label || item.Label || 'Unknown';
                const severity = item.severity || 'Low';
                const badgeClass = `badge-${severity.toLowerCase()}`;

                historyItem.innerHTML = `
                    <div class="history-info">
                        <strong>${labelText}</strong>
                        <span class="severity-badge ${badgeClass}">${severity}</span>
                        <span style="color: #666;">${percentage}</span>
                    </div>
                    <button class="view-btn">View Results</button>
                `;

                // Attach event listener
                const btn = historyItem.querySelector('.view-btn');
                btn.onclick = () => openModal(item.originalImagePath, item.taggedImagePath);

                historyList.appendChild(historyItem);
            });
        } catch (e) { console.error("History load error", e); }
    }

    loadHistory();
}

// --- ADMIN DASHBOARD ---
if (window.location.pathname.includes('admin.html')) {
    async function loadStats() {
        // 1. Fetch General Stats
        const res = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            alert('Access Denied');
            window.location.href = 'dashboard.html';
            return;
        }

        const data = await res.json();

        document.getElementById('total-uploads').innerText = data.totalUploads;
        document.getElementById('active-users').innerText = data.activeUsers;

        // Table
        const tbody = document.getElementById('activity-table');
        tbody.innerHTML = '';
        data.recentActivity.forEach(item => {
            const tr = document.createElement('tr');

            // Format: User | Severity | Result (%) | Time | <Button>
            const percentage = (item.confidence * 100).toFixed(0) + '%';
            const labelText = item.label || item.Label || 'Unknown';
            const severity = item.severity || 'Low';
            const badgeClass = `badge-${severity.toLowerCase()}`;

            tr.innerHTML = `
                <td>${item.User ? item.User.username : 'Unknown'}</td>
                <td><span class="severity-badge ${badgeClass}">${severity}</span></td>
                <td>${labelText} (${percentage})</td>
                <td>${new Date(item.createdAt).toLocaleString()}</td>
                <td><button class="view-btn">View</button></td>
            `;

            const btn = tr.querySelector('.view-btn');
            btn.onclick = () => openModal(item.originalImagePath, item.taggedImagePath);

            tbody.appendChild(tr);
        });

        // Category Chart
        const ctx = document.getElementById('categoryChart').getContext('2d');
        if (window.adminChartInstance) window.adminChartInstance.destroy();
        window.adminChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(data.categories),
                datasets: [{
                    data: Object.values(data.categories),
                    backgroundColor: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
                    borderColor: '#0b1c11'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: document.body.classList.contains('light-mode') ? '#064e3b' : '#e2f1e6' }
                    }
                }
            }
        });

        // 2. Fetch Analytics (New)
        renderAnalytics();
    }

    async function renderAnalytics() {
        try {
            const res = await fetch(`${API_URL}/admin/activity`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            // Helper to render line/bar charts
            const createChart = (id, label, labels, values, type = 'bar') => {
                const ctx = document.getElementById(id).getContext('2d');
                new Chart(ctx, {
                    type: type,
                    data: {
                        labels: labels,
                        datasets: [{
                            label: label,
                            data: values,
                            backgroundColor: 'rgba(16, 185, 129, 0.6)',
                            borderColor: '#10b981',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(16, 185, 129, 0.15)' }, ticks: { color: document.body.classList.contains('light-mode') ? '#047857' : '#8ba896' } },
                            x: { grid: { color: 'rgba(16, 185, 129, 0.15)' }, ticks: { color: document.body.classList.contains('light-mode') ? '#047857' : '#8ba896' } }
                        },
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
            };

            // Daily (Line)
            createChart('dailyChart', 'Uploads', data.daily.map(d => d.date), data.daily.map(d => d.count), 'line');
            // Weekly (Bar)
            createChart('weeklyChart', 'Uploads', data.weekly.map(d => d.week), data.weekly.map(d => d.count), 'bar');
            // Monthly (Bar)
            createChart('monthlyChart', 'Uploads', data.monthly.map(d => d.month), data.monthly.map(d => d.count), 'bar');

        } catch (e) {
            console.error("Analytics Error", e);
        }
    }

    loadStats();
}

// Admin: Reset Database
async function resetDatabase() {
    if (!confirm("⚠️ ARE YOU SURE? \n\nThis will delete ALL users, images, and data permanently.\nYou will be logged out and need to sign up again.")) {
        return;
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/admin/reset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            alert('Database has been reset.');
            logout();
        } else {
            alert('Failed to reset database.');
        }
    } catch (err) {
        console.error(err);
        alert('Error resetting database.');
    }
}
