// ملف setup.js
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('profile-form');
    let galleryUrls = ['', '', ''];

    // 1. جلب المستخدم الحالي وجلب بياناته السابقة إن وجدت لتسهيل التعديل
    const { data: { user } } = await sb.auth.getUser();
    
    if (user) {
        // دالة مساعدة لتحديث معاينة معرض الصور
        function updateGalleryPreview(index, url) {
            const previewDiv = document.getElementById(`gallery-preview-${index}`);
            const inputEl = document.getElementById(`gallery-input-${index}`);
            if (!previewDiv || !inputEl) return;

            if (url) {
                previewDiv.innerHTML = `
                    <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button type="button" class="delete-gallery-img" style="position: absolute; top: 6px; right: 6px; background: rgba(220, 38, 38, 0.85); border: none; color: white; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 10;">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                inputEl.style.display = 'none';

                // مستمع حدث الحذف
                previewDiv.querySelector('.delete-gallery-img').addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    galleryUrls[index - 1] = '';
                    updateGalleryPreview(index, '');
                });
            } else {
                previewDiv.innerHTML = `
                    <i class="fas fa-plus" style="font-size: 20px; color: var(--text-muted);"></i>
                    <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Photo ${index}</span>
                `;
                inputEl.style.display = 'block';
                inputEl.value = '';
            }
        }

        // إعداد مستمعي الأحداث لمدخلات معرض الصور
        [1, 2, 3].forEach(index => {
            const inputEl = document.getElementById(`gallery-input-${index}`);
            if (inputEl) {
                inputEl.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const previewDiv = document.getElementById(`gallery-preview-${index}`);
                    if (!previewDiv) return;

                    // عرض مؤشر التحميل
                    previewDiv.innerHTML = `
                        <i class="fas fa-spinner fa-spin" style="font-size: 20px; color: var(--color-primary);"></i>
                        <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Chargement...</span>
                    `;
                    inputEl.style.pointerEvents = 'none';

                    try {
                        // ضغط الصورة (الحد الأقصى للعرض 800 بكسل، الجودة 0.75)
                        const compressed = await compressImage(file, 800, 0.75);

                        const fileName = `gallery_${user.id}_${index}_${Date.now()}.jpg`;
                        const filePath = `gallery/${fileName}`;

                        const { data: uploadData, error: uploadError } = await sb.storage
                            .from('chat-media')
                            .upload(filePath, compressed, {
                                contentType: 'image/jpeg',
                                upsert: false
                            });

                        if (uploadError) throw uploadError;

                        const { data: urlData } = sb.storage
                            .from('chat-media')
                            .getPublicUrl(filePath);

                        const publicUrl = urlData.publicUrl;
                        galleryUrls[index - 1] = publicUrl;
                        updateGalleryPreview(index, publicUrl);

                    } catch (err) {
                        console.error("Error uploading gallery image:", err);
                        alert("Erreur lors du chargement de l'image : " + err.message);
                        updateGalleryPreview(index, '');
                    } finally {
                        inputEl.style.pointerEvents = 'auto';
                    }
                });
            }
        });

        try {
            const { data: profilesList, error } = await sb
                .from('profiles')
                .select('*')
                .eq('user_id', user.id);

            if (error) {
                console.error("Error fetching profile:", error);
                alert("Erreur lors de la récupération des données de votre profil. Veuillez réessayer.");
                return;
            }

            const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;

            if (profile) {
                // تعبئة البيانات السابقة في الحقول
                if (document.getElementById('fullName')) document.getElementById('fullName').value = profile.full_name || '';
                if (document.getElementById('gender')) document.getElementById('gender').value = profile.gender || '';
                if (document.getElementById('dob')) document.getElementById('dob').value = profile.dob || '';
                if (document.getElementById('bio')) document.getElementById('bio').value = profile.bio || '';
                if (document.getElementById('height')) document.getElementById('height').value = profile.height || '';
                if (document.getElementById('residence')) document.getElementById('residence').value = profile.residence || '';
                if (document.getElementById('income')) document.getElementById('income').value = profile.income || '';
                if (document.getElementById('profession')) document.getElementById('profession').value = profile.profession || '';
                if (document.getElementById('company')) document.getElementById('company').value = profile.company || '';
                if (document.getElementById('body_type')) document.getElementById('body_type').value = profile.body_type || '';
                if (document.getElementById('ethnicity')) document.getElementById('ethnicity').value = profile.ethnicity || '';
                if (document.getElementById('hair_color')) document.getElementById('hair_color').value = profile.hair_color || '';
                if (document.getElementById('instagram')) document.getElementById('instagram').value = profile.instagram || '';
                if (document.getElementById('tiktok')) document.getElementById('tiktok').value = profile.tiktok || '';

                // تحميل الصور الموجودة في المعرض
                if (profile.gallery && Array.isArray(profile.gallery)) {
                    profile.gallery.forEach((url, i) => {
                        if (i < 3 && url) {
                            galleryUrls[i] = url;
                            updateGalleryPreview(i + 1, url);
                        }
                    });
                }

                // إضافة زر إلغاء الرجوع إذا كان البروفايل موجوداً بالفعل لمنع إجبار المستخدم على ملئه مجدداً
                if (form) {
                    const submitBtn = form.querySelector('.btn-submit');
                    if (submitBtn) {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.type = 'button';
                        cancelBtn.className = 'btn';
                        cancelBtn.style.cssText = 'background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-white); margin-top: 10px; font-weight: 600;';
                        cancelBtn.innerHTML = '<i class="fas fa-arrow-left" style="margin-right: 8px;"></i> Annuler et retourner à l\'accueil';
                        cancelBtn.addEventListener('click', () => {
                            window.location.href = 'app.html';
                        });
                        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
                    }
                }
            }
        } catch (err) {
            console.error("Erreur lorsِ de la récupération des anciennes données du profil :", err);
            alert("Erreur lors de la récupération des données de votre profil. Veuillez réessayer.");
        }
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // منع الصفحة من إعادة التحميل

            if (!user) {
                alert("Veuillez d'abord vous connecter !");
                return;
            }

            // 2. تجميع البيانات من الفورم
            const profileData = {
                user_id: user.id, // هذا ضروري للـ RLS
                full_name: document.getElementById('fullName').value,
                gender: document.getElementById('gender').value,
                dob: document.getElementById('dob').value,
                bio: document.getElementById('bio').value,
                height: document.getElementById('height')?.value || null,
                residence: document.getElementById('residence')?.value || null,
                income: document.getElementById('income')?.value || null,
                profession: document.getElementById('profession')?.value || null,
                company: document.getElementById('company')?.value || null,
                body_type: document.getElementById('body_type')?.value || null,
                ethnicity: document.getElementById('ethnicity')?.value || null,
                hair_color: document.getElementById('hair_color')?.value || null
            };

            // إضافة الحقول الاختيارية (الأعمدة موجودة في الداتابيز)
            profileData.instagram = document.getElementById('instagram')?.value || null;
            profileData.tiktok = document.getElementById('tiktok')?.value || null;
            const filteredGallery = galleryUrls.filter(url => url !== '');
            if (filteredGallery.length > 0) profileData.gallery = filteredGallery;

            // 3. إرسال البيانات لجدول profiles
            try {
                const { data, error } = await sb
                    .from('profiles')
                    .upsert(profileData, { onConflict: 'user_id' });

                if (error) {
                    console.error("❌ Save error details:", JSON.stringify(error));
                    alert("خطأ في الحفظ: " + error.message + "\nCode: " + (error.code || 'N/A') + "\nDetails: " + (error.details || 'N/A'));
                    return;
                }

                alert("Vos données ont été enregistrées avec succès !");
                window.location.href = 'app.html';

            } catch (err) {
                console.error("❌ Exception:", err);
                alert("خطأ: " + (err.message || JSON.stringify(err)));
            }
        });
    }
});