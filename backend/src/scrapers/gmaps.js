const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

/**
 * Real Stealth-Puppeteer G-Maps Lead Scraper.
 * Emits leads directly via Socket.io using 'new_lead' and pushes to global leads array.
 */
async function scrapeGMapsLeads(keyword, location, socket, globalLeads, limit = 10) {
    const query = encodeURIComponent(`${keyword} in ${location}`);
    const searchUrl = `https://www.google.com/maps/search/${query}`;
    
    console.log(`[Scraper] Launching Stealth Browser for ${keyword} in ${location}...`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => null);

        let leadsExtracted = 0;
        let lastHeight = 0;

        while (leadsExtracted < limit) {
            const listings = await page.$$('div[role="feed"] > div > div > a');

            for (const listing of listings) {
                if (leadsExtracted >= limit) break;

                await listing.click().catch(() => {});
                await new Promise(r => setTimeout(r, 2000)); 
                
                try {
                    const name = await page.evaluate(() => {
                        const h1 = document.querySelector('h1.fontHeadlineLarge');
                        return h1 ? h1.innerText : null;
                    });

                    const contact = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button[data-tooltip="Copy phone number"]'));
                        return buttons.length > 0 ? buttons[0].getAttribute('aria-label').replace('Phone: ', '').trim() : null;
                    });

                    if (name && contact && contact.match(/[\d\+\- ]+/)) {
                        const lead = {
                            id: `gmaps_${Date.now()}_${leadsExtracted}`,
                            name: name,
                            contact: contact.replace(/[^\d+]/g, ''), 
                            source: 'G-Maps Scraper',
                            status: 'Scraped'
                        };
                        
                        // Push to global array so it persists on the backend
                        if (globalLeads) {
                            globalLeads.push(lead);
                        }
                        
                        // Use the 'new_lead' universal event required by the system
                        socket.emit('new_lead', lead);
                        console.log(`[Scraper] Emitted Lead: ${name} - ${contact}`);
                        leadsExtracted++;
                    }
                } catch (e) {
                    // Silently continue
                }
            }

            lastHeight = await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) return feed.scrollHeight;
                return 0;
            });
            
            await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) feed.scrollTo(0, feed.scrollHeight);
            });
            
            await new Promise(r => setTimeout(r, 3000));
            
            const newHeight = await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) return feed.scrollHeight;
                return 0;
            });

            if (newHeight === lastHeight) {
                console.log('[Scraper] End of listings reached.');
                break;
            }
        }
        
    } catch (error) {
        console.error('[Scraper] Critical Error during extraction:', error);
        socket.emit('scraper_error', { message: error.message });
    } finally {
        await browser.close();
        socket.emit('scraper_done', { count: limit });
        console.log(`[Scraper] Job complete.`);
    }
}

module.exports = { scrapeGMapsLeads };
