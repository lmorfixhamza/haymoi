const fs = require('fs');
let code = fs.readFileSync('www/script.js', 'utf8');

const targetRegex = /filtered\.forEach\(\(profile, index\) => \{([\s\S]*?)list\.appendChild\(card\);\s*\}\);\s*listContainer\.appendChild\(list\);\s*\}/g;

const replacement = \
    let currentIndex = 0;
    const batchSize = 20;

    listContainer.appendChild(list);

    function loadNextBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(currentIndex + batchSize, filtered.length);
        
        for (let i = currentIndex; i < end; i++) {
            const profile = filtered[i];
            const card = createUserCard(profile, i);
            card.addEventListener('click', () => openUserModal(profile));
            fragment.appendChild(card);
        }
        
        list.appendChild(fragment);
        currentIndex = end;
        
        if (currentIndex < filtered.length) {
            setupObserver();
        }
    }

    function setupObserver() {
        const lastCard = list.lastElementChild;
        if (!lastCard) return;
        
        const observer = new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                obs.disconnect();
                loadNextBatch();
            }
        }, { rootMargin: '200px' });
        
        observer.observe(lastCard);
    }

    loadNextBatch();
}
\;

code = code.replace(targetRegex, replacement);
fs.writeFileSync('www/script.js', code);
console.log('Done');
