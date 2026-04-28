// src/logic/About-Logic.js

// 1. CONFIGURATION
import { SCRIPT_URL } from '../config';

const sdgIcons = {
    "1": "fa-hand-holding-dollar",   // No Poverty
    "3": "fa-heart-pulse",           // Good Health
    "4": "fa-book-open-reader",      // Quality Education
    "5": "fa-venus",                 // Gender Equality
    "10": "fa-users-rectangle",      // Reduced Inequality
    "16": "fa-scale-balanced",       // Peace & Justice
    "default": "fa-flag-checkered"
};

// 2. REVEAL OBSERVER (Premium Scroll Animations)
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            revealObserver.unobserve(entry.target); 
        }
    });
}, { threshold: 0.15 });

// 3. ROADMAP ENGINE (Google Sheets Sync)
async function loadRoadmap() {
    const grid = document.getElementById('roadmapGrid');
    if (!grid) return;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getActivities`);
        const data = await response.json();
        
        if (!data || data.length === 0) throw new Error("No data");

        // Clear the loader
        grid.innerHTML = ""; 

        data.forEach((item, index) => {
            const goalMatch = item.SDG ? item.SDG.match(/\d+/) : null;
            const iconClass = goalMatch ? (sdgIcons[goalMatch[0]] || sdgIcons.default) : sdgIcons.default;

            const card = document.createElement('div');
            card.className = "roadmap-card reveal"; 
            
            // Staggered delay for a "wave" effect when scrolling
            card.style.transitionDelay = `${(index % 3) * 0.15}s`;

            card.innerHTML = `
                <i class="fa-solid ${iconClass} sdg-icon" style="color: var(--primary-green); font-size: 2rem; margin-bottom: 15px; display: block;"></i>
                <small style="color: #666; font-weight: 800; text-transform: uppercase; font-size: 10px;">SDG Alignment: ${item.SDG || "General"}</small>
                <h4 style="margin: 10px 0; color: var(--primary-green); font-size: 16px;">
                    ${item.Month}: ${item["Activity Theme"] || "Scheduled Activity"}
                </h4>
                <p style="font-size: 13px; color: #555; line-height: 1.6;">${item.Description || "Details pending from National Command."}</p>
                <div style="margin-top: 15px; font-size: 11px; font-weight: 900; color: var(--accent-red); letter-spacing: 1px;">
                    STATUS: ${item.Status || "PLANNED"}
                </div>
            `;

            grid.appendChild(card);
            revealObserver.observe(card);
        });

    } catch (e) {
        console.error("Roadmap Sync Error:", e);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; margin-bottom: 15px; color: var(--accent-red);"></i>
                <p>The 2026 Operational Roadmap is currently being updated by the Zonal Command. Please check back shortly.</p>
            </div>
        `;
    }
}

// 4. STATS COUNTER ENGINE
function initCounters() {
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = +counter.getAttribute('data-target');
                let count = 0;
                const duration = 2000; 
                const increment = target / (duration / 16); 

                const updateCount = () => {
                    count += increment;
                    if (count < target) {
                        counter.innerText = Math.ceil(count);
                        requestAnimationFrame(updateCount);
                    } else {
                        counter.innerText = target + "+";
                    }
                };
                updateCount();
                counterObserver.unobserve(counter);
            }
        });
    }, { threshold: 1.0 });

    document.querySelectorAll('.counter').forEach(c => counterObserver.observe(c));
}

// 5. EXPORTED INITIALIZATION FUNCTION
export function initAboutPage() {
    console.log("About Page Logic Initialized...");
    
    // Animate existing static elements
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // Load data from Google Sheets
    loadRoadmap();

    // Start counters if they exist
    initCounters();
}