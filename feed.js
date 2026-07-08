// feed.js
// Logic for "Pour Toi" standard scrolling feed (Twitter/Facebook style)

function loadPourToiView() {
    const container = document.getElementById('pourtoi-feed-container');
    if (!container) return;
    
    // Set up basic styles for standard scrolling feed
    if (!document.getElementById('feed-styles')) {
        const style = document.createElement('style');
        style.id = 'feed-styles';
        style.innerHTML = `
            .pourtoi-feed {
                padding: 16px 12px 80px 12px !important;
                display: flex;
                flex-direction: column;
                gap: 20px;
                overflow-y: auto;
                max-height: calc(100vh - 140px);
                background: transparent;
            }
            .feed-video-card {
                background: var(--bg-glass);
                border-radius: 16px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                color: var(--text-color);
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                border: 1px solid rgba(255,255,255,0.05);
            }
            .feed-header {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .feed-avatar {
                width: 45px;
                height: 45px;
                border-radius: 50%;
                object-fit: cover;
                cursor: pointer;
            }
            .feed-username {
                font-weight: 700;
                font-size: 16px;
                cursor: pointer;
            }
            .feed-description {
                font-size: 14.5px;
                line-height: 1.5;
            }
            .feed-media-container {
                width: 100%;
                border-radius: 12px;
                overflow: hidden;
                background: #000;
                margin-top: 4px;
            }
            .feed-media-container video, .feed-media-container img {
                width: 100%;
                max-height: 400px;
                object-fit: cover;
                display: block;
            }
            .feed-actions {
                display: flex;
                gap: 24px;
                align-items: center;
                padding-top: 12px;
                border-top: 1px solid rgba(255,255,255,0.05);
            }
            .feed-action-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: color 0.2s;
            }
            .feed-action-text {
                font-size: 14px;
                font-weight: 600;
            }
            .feed-action-btn.liked {
                color: #ef4444;
            }
        `;
        document.head.appendChild(style);
    }

    // Set page header title
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.style.display = '';
        headerTitle.style.width = '100%';
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const titleColor = isLight ? '#111827' : '#ffffff';
        headerTitle.innerHTML = `
            <div class="chats-section-title-block" style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%;">
                <h2 class="chats-section-title" style="color: ${titleColor}; font-size: 26px; font-weight: 800; margin: 0; line-height: 1.1;">من أجلك</h2>
                <span class="chats-section-subtitle" style="color: var(--text-muted); font-size: 13px; font-weight: 500; margin: 2px 0 0 0;">اكتشف أحدث المنشورات</span>
            </div>
        `;
    }

    // Hide top search bar
    const headerSearch = document.getElementById('header-search-container');
    if (headerSearch) headerSearch.style.display = 'none';

    // Hide top tab buttons
    const toHide = ['header-user-avatar', 'notif-bell-btn', 'tab-search', 'tab-groups', 'tab-vip', 'header-settings-btn', 'header-compose-btn'];
    toHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (!window._pourToiPosts) {
        if (typeof MOCK_BOTS !== 'undefined') {
            const sampleVideos = [
                'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-1232-large.mp4',
                'https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4',
                'https://assets.mixkit.co/videos/preview/mixkit-portrait-of-a-woman-in-a-pool-1259-large.mp4',
                'https://assets.mixkit.co/videos/preview/mixkit-a-girl-blowing-a-bubble-gum-at-an-amusement-park-1226-large.mp4'
            ];
            window._pourToiPosts = MOCK_BOTS.slice(0, 4).map((bot, index) => ({
                post_id: 'post_vid_' + index,
                user_id: bot.user_id,
                full_name: bot.full_name || bot.name || bot.pseudo || 'Utilisateur',
                avatar_url: bot.avatar_url,
                caption: 'مشاركة جديدة! 🔥 #haymoi #' + (bot.full_name || 'bot').replace(/\s+/g, ''),
                media_url: sampleVideos[index % sampleVideos.length],
                likes: Math.floor(Math.random() * 500) + 50,
                comments: Math.floor(Math.random() * 50) + 5,
                likedByUser: false,
                isVideo: true
            }));
            
            if (typeof MOCK_POSTS !== 'undefined') {
                window._pourToiPosts = window._pourToiPosts.concat(JSON.parse(JSON.stringify(MOCK_POSTS)));
            }
        } else {
            window._pourToiPosts = typeof MOCK_POSTS !== 'undefined' ? JSON.parse(JSON.stringify(MOCK_POSTS)) : [];
        }
    }

    renderFeed(container);
}

function renderFeed(container) {
    container.innerHTML = window._pourToiPosts.map(post => {
        const heartClass = post.likedByUser ? 'fas fa-heart' : 'far fa-heart';
        const likedClass = post.likedByUser ? 'liked' : '';
        
        return `
            <div class="feed-video-card" data-post-id="${post.post_id}">
                <div class="feed-header">
                    <img class="feed-avatar" src="${post.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" onclick="if(typeof openProfileFromPost === 'function') openProfileFromPost('${post.user_id}')">
                    <span class="feed-username" onclick="if(typeof openProfileFromPost === 'function') openProfileFromPost('${post.user_id}')">${post.full_name}</span>
                </div>
                <div class="feed-description">${post.caption || post.description || ''}</div>
                <div class="feed-media-container">
                    ${post.isVideo ? `<video src="${post.media_url}" controls playsinline></video>` : `<img src="${post.media_url}" alt="Post">`}
                </div>
                <div class="feed-actions">
                    <button class="feed-action-btn ${likedClass} like-btn" onclick="toggleFeedLike('${post.post_id}', this)">
                        <i class="${heartClass}"></i>
                        <span class="feed-action-text like-count">${post.likes}</span>
                    </button>
                    <button class="feed-action-btn">
                        <i class="far fa-comment"></i>
                        <span class="feed-action-text">${post.comments || 0}</span>
                    </button>
                    <button class="feed-action-btn" onclick="if(typeof shareContent === 'function') shareContent()">
                        <i class="fas fa-share"></i>
                        <span class="feed-action-text">Share</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.toggleFeedLike = function(postId, btnEl) {
    const post = window._pourToiPosts.find(p => p.post_id === postId);
    if (!post) return;
    
    post.likedByUser = !post.likedByUser;
    post.likes += post.likedByUser ? 1 : -1;
    
    const icon = btnEl.querySelector('i');
    const count = btnEl.querySelector('.like-count');
    
    if (post.likedByUser) {
        btnEl.classList.add('liked');
        icon.className = 'fas fa-heart';
    } else {
        btnEl.classList.remove('liked');
        icon.className = 'far fa-heart';
    }
    count.textContent = post.likes;
};
