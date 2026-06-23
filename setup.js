// ملف setup.js
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('profile-form');

    // 1. جلب المستخدم الحالي وجلب بياناته السابقة إن وجدت لتسهيل التعديل
    const { data: { user } } = await sb.auth.getUser();
    
    if (user) {
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
            console.error("Erreur lors de la récupération des anciennes données du profil :", err);
            alert("Erreur lors de la récupération des données de votre profil. Veuillez réessayer.");
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // منع الصفحة من إعادة التحميل

        if (!user) {
            alert("Veuillez d'abord vous connecter !");
            return;
        }

        // 2. تجميع البيانات من الفورم
        const profileData = {
            user_id: user.id, // هذا ضروري للـ RLS
            full_name: document.getElementById('fullName').value, // تطابق ID في HTML
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

        // 3. إرسال البيانات لجدول profiles (باستخدام الاستعلام والتحديث أو الإدخال لتجنب التكرار وتفادي قيود RLS/Primary Key)
        try {
            const { data: existingProfiles, error: fetchErr } = await sb
                .from('profiles')
                .select('user_id')
                .eq('user_id', user.id);
            
            if (fetchErr) throw fetchErr;

            let saveResult;
            if (existingProfiles && existingProfiles.length > 0) {
                // تحديث جميع السجلات التي لديها نفس user_id لتفادي التكرار مستقبلاً
                saveResult = await sb
                    .from('profiles')
                    .update(profileData)
                    .eq('user_id', user.id);
            } else {
                // إدخال سجل جديد لأول مرة
                saveResult = await sb
                    .from('profiles')
                    .insert([profileData]);
            }

            if (saveResult.error) throw saveResult.error;

            alert("Vos données ont été enregistrées avec succès !");
            window.location.href = 'app.html'; // حول المستخدم للصفحة الرئيسية

        } catch (err) {
            console.error("Erreur lors de l'enregistrement :", err);
            alert("Une erreur est survenue lors de l'enregistrement de vos données. Veuillez réessayer.");
        }
    });
});