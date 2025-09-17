(function(){
  const btn = document.getElementById('btn-request-access');
  const modal = document.getElementById('access-modal');
  const form = document.getElementById('access-modal-form');
  const cancel = document.getElementById('access-cancel');

  const guessUser = () => {
    try {
      if (window.currentUser?.email) return { name: window.currentUser.name || "", email: window.currentUser.email };
      if (window.authUser?.email)   return { name: window.authUser.name || "", email: window.authUser.email };
    } catch(e){}
    return { name: "", email: "" };
  };

  const openModal = () => {
    const { name, email } = guessUser();
    form.name.value = name || "";
    form.email.value = email || "";
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    form.name.focus();
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  };

  const encode = (data) =>
    Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&');

  const submitToNetlify = async (payload) => {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'access-requests', ...payload })
    });
    if (!res.ok) throw new Error('Netlify form post failed: ' + res.status);
    return true;
  };

  const mailtoFallback = (payload) => {
    const to = 'agse.grp.portmarly@gmail.com';
    const subject = 'Demande d’accès – Espace adhérents';
    const body = `Bonjour,\n\nJe souhaite obtenir un accès à l’Espace adhérents.\n\nNom: ${payload.name || ''}\nEmail: ${payload.email || ''}\nMessage: ${payload.message || ''}\n\nMerci !`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Ouvrir / fermer
  btn?.addEventListener('click', (e)=>{ e.preventDefault(); openModal(); });
  cancel?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });

  // Soumission
  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const submitBtn = document.getElementById('access-send');
    submitBtn.disabled = true; submitBtn.textContent = 'Envoi...';

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim()
    };

    try {
      await submitToNetlify(payload);
      submitBtn.textContent = 'Envoyé ✔';
      setTimeout(()=>{
        alert("Votre demande a bien été envoyée. Nous revenons vers vous rapidement.");
        closeModal();
        submitBtn.disabled = false; submitBtn.textContent = 'Envoyer';
        form.reset();
      }, 150);
    } catch(err){
      console.warn('Netlify Forms indisponible, fallback mailto.', err);
      mailtoFallback(payload);
      submitBtn.disabled = false; submitBtn.textContent = 'Envoyer';
      closeModal();
    }
  });
})();
