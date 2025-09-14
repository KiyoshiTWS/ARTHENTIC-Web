document.addEventListener('DOMContentLoaded', function () {
    const darkModeBtn = document.getElementById('darkModeToggle');
    const siteLogo = document.getElementById('siteLogo');

    // Apply saved preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        if (siteLogo) siteLogo.src = "whitelogo.png";
        if (darkModeBtn) {
            const icon = darkModeBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('bi-moon');
                icon.classList.add('bi-brightness-high');
            }
        }
    }

    // Toggle dark mode only if button exists
    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            const icon = darkModeBtn.querySelector('i');

            if (document.body.classList.contains('dark-mode')) {
                if (icon) {
                    icon.classList.remove('bi-moon');
                    icon.classList.add('bi-brightness-high');
                }
                if (siteLogo) siteLogo.src = "whitelogo.png";
                localStorage.setItem('darkMode', 'enabled');
            } else {
                if (icon) {
                    icon.classList.remove('bi-brightness-high');
                    icon.classList.add('bi-moon');
                }
                if (siteLogo) siteLogo.src = "logo.png";
                localStorage.setItem('darkMode', 'disabled');
            }
        });
    }
});
