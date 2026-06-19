// ملف setup.js
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('profile-form');

    // 1. جلب المستخدم الحالي وجلب بياناته السابقة إن وجدت لتسهيل التعديل
    const { data: { user } } = await sb.auth.getUser();
    
    // إنشاء صندوق تصحيح الأخطاء وعرضه على الشاشة
    const setupBox = document.querySelector('.setup-box');
    if (setupBox) {
        const debugBox = document.createElement('div');
        debugBox.id = 'debug-auth-box';
        debugBox.style.cssText = 'margin-top: 20px; border: 1px dashed #ef4444; padding: 12px; border-radius: 10px; font-size: 12.5px; font-family: monospace; background: rgba(239, 68, 68, 0.05); text-align: left; direction: ltr; color: #fca5a5; width: 100%;';
        debugBox.innerHTML = `
            <h4 style="margin: 0 0 8px 0; color: #ef4444; font-weight: 700;">[HayMoi Debug Panel]</h4>
            <div><strong>User ID:</strong> <span id="debug-user-id">${user ? user.id : 'No User'}</span></div>
            <div><strong>Email:</strong> <span id="debug-user-email">${user ? user.email : 'No Email'}</span></div>
            <div><strong>Profile in DB:</strong> <span id="debug-profile-status">Querying...</span></div>
            <div><strong>DB Error:</strong> <span id="debug-error-details">None</span></div>
        `;
        setupBox.appendChild(debugBox);
    }

    if (user) {
        try {
            const { data: profilesList, error } = await sb
                .from('profiles')
                .select('*')
                .eq('user_id', user.id);

            const statusEl = document.getElementById('debug-profile-status');
            const errorEl = document.getElementById('debug-error-details');

            if (error) {
                console.error("Error fetching profile:", error);
                if (statusEl) statusEl.textContent = "Error";
                if (errorEl) errorEl.textContent = `${error.message} (Code: ${error.code})`;
                alert("DEBUG SELECT ERROR: خطأ في جلب بيانات البروفايل: " + error.message + "\nCode: " + error.code + "\nDetails: " + error.details);
                return;
            }

            const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;
            if (statusEl) statusEl.textContent = profile ? `Found (Name: ${profile.full_name})` : "Not Found (Null)";
            if (errorEl) errorEl.textContent = "None";

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
                        cancelBtn.innerHTML = '<i class="fas fa-arrow-right" style="margin-left: 8px;"></i> إلغاء والعودة للرئيسية';
                        cancelBtn.addEventListener('click', () => {
                            window.location.href = 'app.html';
                        });
                        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
                    }
                }
            }
        } catch (err) {
            console.error("خطأ أثناء جلب البيانات السابقة للبروفايل:", err);
            alert("DEBUG SELECT EXCEPTION: خطأ في جلب بيانات البروفايل: " + err.message);
            const statusEl = document.getElementById('debug-profile-status');
            const errorEl = document.getElementById('debug-error-details');
            if (statusEl) statusEl.textContent = "Exception";
            if (errorEl) errorEl.textContent = err.message;
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // منع الصفحة من إعادة التحميل

        if (!user) {
            alert("يرجى تسجيل الدخول أولاً!");
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

            alert("تم حفظ بياناتك بنجاح!");
            window.location.href = 'app.html'; // حول المستخدم للصفحة الرئيسية

        } catch (err) {
            console.error("خطأ أثناء الحفظ:", err);
            alert("DEBUG SAVE ERROR: حدث خطأ أثناء حفظ البيانات: " + err.message + "\nCode: " + (err.code || 'None') + "\nDetails: " + (err.details || 'None'));
        }
    });
});