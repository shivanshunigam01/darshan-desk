# Manual testing — simplified autofill flow

1. `npm run dev` — API :4000, UI :5173  
2. Login `admin@darshandesk.local` / `admin123`  
3. **Pilgrims** — add profile (name, age, gender, ID type/number, mobile, city) → **Save & prepare autofill**  
4. **Ready to Fill** — select account + pilgrims → **Save, validate & generate pairing token**  
5. Chrome → load `apps/extension/dist` → paste token → API `http://localhost:4000`  
6. Log in on **official TTD** in a normal tab (your credentials)  
7. Extension → **Sync & Fill** on supported pilgrim step (mock: `http://localhost:4000/mock-booking/`)  
8. **Validate fields** — fix mismatches  
9. Complete CAPTCHA / payment **yourself** on TTD  

Admin routes still at `/admin/*` for super admin.