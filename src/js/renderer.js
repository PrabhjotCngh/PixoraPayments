
document.addEventListener("DOMContentLoaded", () => {
    // Page fade-in animation
    document.querySelectorAll(".site-page").forEach(el => {
        el.classList.add("fade-in");
    });

    // Active menu underline
    const links = document.querySelectorAll(".nav-link");
    const currentPage = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".site-nav-links a").forEach(link => {
        const href = link.getAttribute("href");
        if (href === currentPage) {
            link.classList.add("active");
        }
    });

    // Scroll reveal
    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("active");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    document
        .querySelectorAll(".reveal")
        .forEach(el => observer.observe(el));
});
