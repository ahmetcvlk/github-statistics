// ==========================================
// THEME MANAGEMENT
// ==========================================

let currentTheme = localStorage.getItem("theme") || "light";

function setTheme(theme) {
    currentTheme = theme;

    document.documentElement.setAttribute("data-theme", theme);

    const themeButton = document.getElementById("theme-toggle");

    themeButton.innerHTML = `
        <i data-lucide="${theme === "light" ? "moon" : "sun"}"></i>
    `;

    lucide.createIcons();

    localStorage.setItem("theme", theme);
}

document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
});

setTheme(currentTheme);


// ==========================================
// LANGUAGE MANAGEMENT
// ==========================================

const translations = {
    en: {
        appTitle: "Github Statistics",
        usernamePlaceholder: "Github Username",
        apiKeyPlaceholder: "Github API Key",
        fetch: "Fetch",

        repositories: "Repositories",
        stars: "Stars",
        forks: "Forks",
        views: "Views",
        clones: "Clones",
        visitors: "Unique visitors",
        cloners: "Unique cloners",
        updated: "Last updated",

        public: "Public",
        private: "Private",

        traffic: "Traffic",
        last14Days: "Last 14 days",
        dailyClones: "Daily clones",
        totalClones: "Total clones",
        uniqueClones: "Unique cloners",

        popularPaths: "Popular paths",
        popularReferrers: "Popular referrers",

        path: "Path",
        referrer: "Referrer",
        count: "Views",
        uniques: "Unique views",

        noDescription: "No description provided.",
        noData: "No data available.",
        unavailable: "Unavailable",
        loading: "Loading...",

        noRepositories: "No repositories found.",
        enterUsername: "Please enter a Github username.",
        enterToken: "Please enter a Github token.",
        accountMismatch: "The token does not belong to this Github username.",
        requestError: "Something went wrong"
    },

    tr: {
        appTitle: "Github İstatistikleri",
        usernamePlaceholder: "Github Kullanıcı Adı",
        apiKeyPlaceholder: "Github API Anahtarı",
        fetch: "Getir",

        repositories: "Depolar",
        stars: "Yıldız",
        forks: "Fork",
        views: "Görüntülenme",
        clones: "Klonlanma",
        visitors: "Tekil ziyaretçi",
        cloners: "Tekil klonlayan",
        updated: "Son güncelleme",

        public: "Herkese açık",
        private: "Özel",

        traffic: "Trafik",
        last14Days: "Son 14 gün",
        dailyClones: "Günlük klonlanma",
        totalClones: "Toplam klon",
        uniqueClones: "Tekil klonlayan",

        popularPaths: "Popüler yollar",
        popularReferrers: "Popüler yönlendirme kaynakları",

        path: "Yol",
        referrer: "Kaynak",
        count: "Görüntülenme",
        uniques: "Tekil görüntülenme",

        noDescription: "Açıklama bulunmuyor.",
        noData: "Veri bulunamadı.",
        unavailable: "Erişilemiyor",
        loading: "Yükleniyor...",

        noRepositories: "Repository bulunamadı.",
        enterUsername: "Lütfen Github kullanıcı adını gir.",
        enterToken: "Lütfen Github token'ını gir.",
        accountMismatch: "Token bu Github kullanıcı adına ait değil.",
        requestError: "Bir hata oluştu"
    }
};

let currentLanguage = localStorage.getItem("language") || "en";

// Dashboard verisini hafızada tutuyoruz.
// Böylece dil değişince API'ye tekrar istek göndermiyoruz.
let dashboardState = null;

// Chart nesnelerini saklıyoruz.
let cloneCharts = [];

function t(key) {
    return translations[currentLanguage]?.[key]
        ?? translations.en[key]
        ?? key;
}

function setLanguage(language) {
    currentLanguage = language;

    document.documentElement.lang = language;

    document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    });

    document.getElementById("language-toggle").textContent =
        language === "en" ? "TR" : "EN";

    localStorage.setItem("language", language);

    // Dashboard varsa yeni dile göre tekrar oluştur.
    if (dashboardState) {
        renderDashboard(
            dashboardState.repos,
            dashboardState.trafficData
        );
    }
}

document.getElementById("language-toggle").addEventListener("click", () => {
    setLanguage(currentLanguage === "en" ? "tr" : "en");
});

setLanguage(currentLanguage);


// ==========================================
// DOM ELEMENTS
// ==========================================

const usernameInput = document.getElementById("username");
const apiKeyInput = document.getElementById("apikey");
const fetchButton = document.getElementById("fetch-btn");
const repoList = document.getElementById("repoList");

const API_URL = "https://api.github.com";


// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function githubRequest(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28"
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
    }

    return data;
}


function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}


function formatNumber(value) {
    return new Intl.NumberFormat(
        currentLanguage === "tr" ? "tr-TR" : "en-US"
    ).format(value ?? 0);
}


function formatDate(value) {
    return new Intl.DateTimeFormat(
        currentLanguage === "tr" ? "tr-TR" : "en-US",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    ).format(new Date(value));
}


async function mapWithConcurrency(items, limit, callback) {
    const results = new Array(items.length);
    let currentIndex = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (currentIndex < items.length) {
                const index = currentIndex++;
                results[index] = await callback(items[index]);
            }
        }
    );

    await Promise.all(workers);

    return results;
}


// ==========================================
// REPOSITORY TRAFFIC
// ==========================================

async function getRepositoryTraffic(repo, token) {

    const basePath =
        `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;

    const endpoints = {
        views: `${basePath}/traffic/views`,
        clones: `${basePath}/traffic/clones`,
        paths: `${basePath}/traffic/popular/paths`,
        referrers: `${basePath}/traffic/popular/referrers`
    };

    const results = await Promise.allSettled(
        Object.entries(endpoints).map(([key, endpoint]) =>
            githubRequest(endpoint, token)
        )
    );

    return {
        views: results[0].status === "fulfilled" ? results[0].value : null,
        clones: results[1].status === "fulfilled" ? results[1].value : null,
        paths: results[2].status === "fulfilled" ? results[2].value : null,
        referrers: results[3].status === "fulfilled" ? results[3].value : null
    };
}


// ==========================================
// POPULAR PATHS
// ==========================================

function renderPopularPaths(paths, repo) {

    if (!paths || paths.length === 0) {
        return `<p class="empty-state">${t("noData")}</p>`;
    }

    return `
        <div class="traffic-list">

            ${paths.map(item => {

        const pathUrl = `https://github.com${item.path}`;

        return `
                    <div class="traffic-list-item">

                        <div class="traffic-list-info">

                            <a
                                href="${escapeHtml(pathUrl)}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="traffic-item-title"
                            >
                                ${escapeHtml(item.title || item.path)}
                            </a>

                            <span class="traffic-item-subtitle">
                                ${escapeHtml(item.path)}
                            </span>

                        </div>

                        <div class="traffic-list-stats">
                            <strong>${formatNumber(item.count)}</strong>
                            <small>
                                ${formatNumber(item.uniques)} ${t("visitors")}
                            </small>
                        </div>

                    </div>
                `;

    }).join("")}

        </div>
    `;
}


// ==========================================
// POPULAR REFERRERS
// ==========================================

function renderPopularReferrers(referrers) {

    if (!referrers || referrers.length === 0) {
        return `<p class="empty-state">${t("noData")}</p>`;
    }

    return `
        <div class="traffic-list">

            ${referrers.map(item => `

                <div class="traffic-list-item">

                    <div class="traffic-list-info">

                        <span class="traffic-item-title">
                            ${escapeHtml(item.referrer)}
                        </span>

                    </div>

                    <div class="traffic-list-stats">
                        <strong>${formatNumber(item.count)}</strong>
                        <small>
                            ${formatNumber(item.uniques)} ${t("visitors")}
                        </small>
                    </div>

                </div>

            `).join("")}

        </div>
    `;
}


// ==========================================
// CLONE CHARTS
// ==========================================

function renderCloneChart(clones, index) {

    if (!clones || !clones.clones || clones.clones.length === 0) {
        return `<p class="empty-state">${t("noData")}</p>`;
    }

    return `
        <div class="clone-chart-container">
            <canvas id="clone-chart-${index}"></canvas>
        </div>
    `;
}


function createCloneCharts(trafficData) {

    // Eski grafik nesnelerini temizle.
    cloneCharts.forEach(chart => chart.destroy());
    cloneCharts = [];

    trafficData.forEach((traffic, index) => {

        if (!traffic.clones?.clones?.length) {
            return;
        }

        const canvas = document.getElementById(`clone-chart-${index}`);

        if (!canvas) {
            return;
        }

        const dailyClones = traffic.clones.clones;

        const labels = dailyClones.map(item => formatDate(item.timestamp));

        const totalData = dailyClones.map(item => item.count);
        const uniqueData = dailyClones.map(item => item.uniques);

        const chart = new Chart(canvas, {
            type: "line",

            data: {
                labels,

                datasets: [
                    {
                        label: t("totalClones"),
                        data: totalData,
                        borderColor: "#60A5FA",
                        backgroundColor: "rgba(96, 165, 250, 0.12)",
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: t("uniqueClones"),
                        data: uniqueData,
                        borderColor: "#34D399",
                        backgroundColor: "rgba(52, 211, 153, 0.08)",
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        fill: false
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    intersect: false,
                    mode: "index"
                },

                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: getComputedStyle(document.body)
                                .getPropertyValue("--color-text-secondary").trim(),
                            usePointStyle: true,
                            padding: 18
                        }
                    },

                    tooltip: {
                        callbacks: {
                            label: context =>
                                `${context.dataset.label}: ${formatNumber(context.parsed.y)}`
                        }
                    }
                },

                scales: {
                    x: {
                        ticks: {
                            color: getComputedStyle(document.body)
                                .getPropertyValue("--color-text-muted").trim(),
                            maxRotation: 0,
                            autoSkip: true
                        },
                        grid: {
                            display: false
                        }
                    },

                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0,
                            color: getComputedStyle(document.body)
                                .getPropertyValue("--color-text-muted").trim()
                        },
                        grid: {
                            color: getComputedStyle(document.body)
                                .getPropertyValue("--color-border").trim()
                        }
                    }
                }
            }
        });

        cloneCharts.push(chart);
    });
}


// ==========================================
// DASHBOARD RENDERING
// ==========================================

function renderDashboard(repos, trafficData) {

    const sortedEntries = repos
        .map((repo, index) => ({
            repo,
            traffic: trafficData[index]
        }))
        .sort((a, b) => {
            const clonesA = a.traffic?.clones?.count ?? 0;
            const clonesB = b.traffic?.clones?.count ?? 0;

            return clonesB - clonesA;
        });

    repos = sortedEntries.map(item => item.repo);
    trafficData = sortedEntries.map(item => item.traffic);

    // Summary calculations
    const totalStars = repos.reduce(
        (sum, repo) => sum + repo.stargazers_count, 0
    );

    const totalForks = repos.reduce(
        (sum, repo) => sum + repo.forks_count, 0
    );

    const totalViews = trafficData.reduce(
        (sum, item) => sum + (item.views?.count ?? 0), 0
    );

    const totalClones = trafficData.reduce(
        (sum, item) => sum + (item.clones?.count ?? 0), 0
    );


    // Summary cards
    const summaryCards = [
        {
            icon: "folder-git-2",
            label: t("repositories"),
            value: repos.length
        },
        {
            icon: "star",
            label: t("stars"),
            value: totalStars
        },
        {
            icon: "git-fork",
            label: t("forks"),
            value: totalForks
        },
        {
            icon: "eye",
            label: t("views"),
            value: totalViews
        },
        {
            icon: "download",
            label: t("clones"),
            value: totalClones
        }
    ];

    const summaryHTML = summaryCards.map(card => `
        <article class="stat-card">

            <div class="stat-card-icon">
                <i data-lucide="${card.icon}"></i>
            </div>

            <span class="stat-card-label">
                ${escapeHtml(card.label)}
            </span>

            <strong class="stat-card-value">
                ${formatNumber(card.value)}
            </strong>

        </article>
    `).join("");


    // Repository cards
    const repoHTML = repos.map((repo, index) => {

        const traffic = trafficData[index];

        const views = traffic.views;
        const clones = traffic.clones;

        return `
            <article class="repo-card">

                <div class="repo-card-header">

                    <div>
                        <a
                            class="repo-name"
                            href="${escapeHtml(repo.html_url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ${escapeHtml(repo.name)}
                            <i data-lucide="external-link"></i>
                        </a>

                        <p class="repo-description">
                            ${escapeHtml(repo.description || t("noDescription"))}
                        </p>
                    </div>

                    <span class="repo-visibility">
                        ${repo.private ? t("private") : t("public")}
                    </span>

                </div>


                <div class="repo-details">

                    <span>
                        <i data-lucide="star"></i>
                        ${formatNumber(repo.stargazers_count)}
                    </span>

                    <span>
                        <i data-lucide="git-fork"></i>
                        ${formatNumber(repo.forks_count)}
                    </span>

                    <span>
                        <i data-lucide="code"></i>
                        ${escapeHtml(repo.language || "-")}
                    </span>

                    <span>
                        <i data-lucide="calendar"></i>
                        ${t("updated")}: ${formatDate(repo.updated_at)}
                    </span>

                </div>


                <!-- TRAFFIC SUMMARY -->

                <div class="repo-traffic">

                    <div class="traffic-item">

                        <span class="traffic-label">
                            <i data-lucide="eye"></i>
                            ${t("views")}
                        </span>

                        <strong>
                            ${views ? formatNumber(views.count) : t("unavailable")}
                        </strong>

                        <small>
                            ${views
                ? `${formatNumber(views.uniques)} ${t("visitors")}`
                : ""
            }
                        </small>

                    </div>


                    <div class="traffic-item">

                        <span class="traffic-label">
                            <i data-lucide="download"></i>
                            ${t("clones")}
                        </span>

                        <strong>
                            ${clones ? formatNumber(clones.count) : t("unavailable")}
                        </strong>

                        <small>
                            ${clones
                ? `${formatNumber(clones.uniques)} ${t("cloners")}`
                : ""
            }
                        </small>

                    </div>

                </div>


                <!-- CLONE CHART -->

                <div class="repo-traffic-section">

                    <div class="traffic-section-header">
                        <h3>${t("dailyClones")}</h3>
                        <span>${t("last14Days")}</span>
                    </div>

                    ${renderCloneChart(clones, index)}

                </div>


                <!-- POPULAR PATHS -->

                <div class="repo-traffic-section">

                    <div class="traffic-section-header">
                        <h3>${t("popularPaths")}</h3>
                    </div>

                    ${renderPopularPaths(traffic.paths, repo)}

                </div>


                <!-- POPULAR REFERRERS -->

                <div class="repo-traffic-section">

                    <div class="traffic-section-header">
                        <h3>${t("popularReferrers")}</h3>
                    </div>

                    ${renderPopularReferrers(traffic.referrers)}

                </div>

            </article>
        `;

    }).join("");


    // Insert dashboard
    repoList.innerHTML = `
    

        <section class="dashboard-summary">
            ${summaryHTML}
        </section>

        <section class="repository-section">

            <h2>${t("repositories")}</h2>

            <div class="repo-grid">
                ${repoHTML || `<p>${t("noRepositories")}</p>`}
            </div>

        </section>

    `;


    // Initialize icons and charts
    lucide.createIcons();

    createCloneCharts(trafficData);
}


// ==========================================
// FETCH GITHUB STATISTICS
// ==========================================

fetchButton.addEventListener("click", async () => {

    const username = usernameInput.value.trim();
    const token = apiKeyInput.value.trim();


    if (!username) {
        repoList.textContent = t("enterUsername");
        return;
    }

    if (!token) {
        repoList.textContent = t("enterToken");
        return;
    }


    try {

        fetchButton.disabled = true;
        fetchButton.textContent = t("loading");


        // 1. Verify authenticated account
        const account = await githubRequest("/user", token);

        if (account.login.toLowerCase() !== username.toLowerCase()) {
            throw new Error(t("accountMismatch"));
        }


        // 2. Get owned repositories
        const repos = await githubRequest(
            "/user/repos?visibility=all&affiliation=owner&sort=updated&per_page=20",
            token
        );


        // 3. Get traffic data for repositories
        const trafficData = await mapWithConcurrency(
            repos,
            5,
            repo => getRepositoryTraffic(repo, token)
        );


        // 4. Save dashboard data
        dashboardState = {
            repos,
            trafficData
        };


        // 5. Render dashboard
        renderDashboard(repos, trafficData);


    } catch (error) {

        repoList.textContent = `${t("requestError")}: ${error.message}`;

    } finally {

        fetchButton.disabled = false;
        fetchButton.textContent = t("fetch");

    }

});