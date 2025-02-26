const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class ExtensionScraper {
  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new",  // "new" headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }

  async scrapeExtensions(savePath) {
    try {
      const page = await this.browser.newPage();
      
      await page.setDefaultNavigationTimeout(120000); // 60000 dan 120000 ga oshiramiz
      await page.setDefaultTimeout(60000); // 30000 dan 60000 ga oshiramiz
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Turli xil saralash usullari bilan qidirish
      const sortOptions = [
        'Installs', // Eng ko'p o'rnatilgan
        'Rating', // Eng yuqori baholangan
        'PublisherCount', // Eng ko'p nashriyotchilar
        'UpdatedDate', // Eng so'nggi yangilangan
        'ReleaseDate', // Eng so'nggi chiqarilgan
        'Name' // Alifbo tartibida
      ];
      
      const processedUrls = new Set();
      let totalProcessed = 0;
      
      // Har bir saralash usuli bilan qidirish
      for (const sortOption of sortOptions) {
        console.log(`\n=== ${sortOption} bo'yicha qidirilmoqda ===\n`);
        
        const url = `https://marketplace.visualstudio.com/search?target=VSCode&category=All%20categories&sortBy=${sortOption}`;
        console.log(`VSCode Marketplace sahifasiga o'tilmoqda: ${url}`);
        
        await page.goto(url, {
          waitUntil: 'networkidle0'
        });
        
        console.log('Sahifa elementlari yuklanishini kutish...');
        await page.waitForSelector('.item-list-container', { timeout: 80000 });
        
        let scrollCount = 0;
        const maxScrolls = 200; // 100 dan 200 ga oshiramiz
        let consecutiveEmptyScrolls = 0;
        
        // Function to extract URLs from the current page view
        const extractUrls = async () => {
          return await page.evaluate(() => {
            // Try multiple selectors to find all possible extensions
            const selectors = [
              '.item-grid-container .row-item a',
              '.item-list-container .row-item a',
              '.gallery-item-card-container a',
              '.ux-item-card a',
              '.item-grid-container a[href*="/items"]',
              '.item-list-container a[href*="/items"]'
            ];
            
            const urls = new Set();
            
            // Try each selector and collect unique URLs
            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                if (element.href && element.href.includes('/items?itemName=')) {
                  urls.add(element.href);
                }
              }
            }
            
            return Array.from(urls);
          });
        };
        
        // Initial extraction before scrolling
        let newUrls = await extractUrls();
        console.log(`Dastlabki URLlar soni: ${newUrls.length}`);
        
        // Process initial batch of URLs
        for (const url of newUrls) {
          if (!processedUrls.has(url)) {
            processedUrls.add(url);
            console.log(`Murojaat qilinmoqda: ${url}`);
            // Save only to database
            const extensionData = await this.fetchExtensionData(url);
            await this.saveToDatabase(extensionData, savePath);
            totalProcessed++;
          }
        }
        
        // Continue scrolling and processing until termination conditions are met
        while (scrollCount < maxScrolls && consecutiveEmptyScrolls < 8) { // 5 dan 8 ga oshiramiz
          scrollCount++;
          console.log(`Sahifani pastga siljitish... (${scrollCount}/${maxScrolls})`);
          
          // Scroll down once
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 5);
          });
          
          // Wait for new content to load
          await page.evaluate(() => {
            return new Promise(resolve => setTimeout(resolve, 5000));
          });
          
          // Extract new URLs after scrolling
          newUrls = await extractUrls();
          
          // Filter out already processed URLs
          const unprocessedUrls = newUrls.filter(url => !processedUrls.has(url));
          console.log(`Yangi topilgan URLlar: ${unprocessedUrls.length}`);
          
          // If no new URLs found, increment empty scroll counter
          if (unprocessedUrls.length === 0) {
            consecutiveEmptyScrolls++;
            console.log(`Yangi URL topilmadi (${consecutiveEmptyScrolls}/8), davom etilmoqda...`);
          } else {
            // Reset empty scroll counter if new URLs found
            consecutiveEmptyScrolls = 0;
            
            // Process all new URLs before scrolling again
            for (const url of unprocessedUrls) {
              processedUrls.add(url);
              console.log(`Murojaat qilinmoqda: ${url}`);
              // Save only to database
              const extensionData = await this.fetchExtensionData(url);
              await this.saveToDatabase(extensionData, savePath);
              totalProcessed++;
            }
            
            console.log(`Jami qayta ishlangan URLlar: ${totalProcessed}`);
          }
        }
        
        if (consecutiveEmptyScrolls >= 8) {
          console.log(`Ketma-ket 8 marta yangi URL topilmadi, keyingi saralash usuliga o'tilmoqda...`);
        } else if (scrollCount >= maxScrolls) {
          console.log(`Maksimal scroll miqdoriga yetildi, keyingi saralash usuliga o'tilmoqda...`);
        }
      }
      
      console.log(`\n=== YAKUNIY NATIJA ===`);
      console.log(`Jami topilgan va qayta ishlangan URLlar: ${totalProcessed}`);
      return totalProcessed;
    } catch (error) {
      console.error('Scraping xatosi:', error);
      throw error;
    }
  }

  async savePagesToFile() {
    try {
      const Extension = require('../database/models/Extension');
      const extensions = await Extension.findAll();
      for (const extension of extensions) {
        const url = extension.url;
        const pageContent = await this.fetchPageContent(url);
        const filePath = path.join('your_file_path_here', `${extension.name}.html`);
        await fs.writeFile(filePath, pageContent);
        console.log(`Saved page content for ${extension.name} to file.`);
      }
    } catch (error) {
      console.error('Error saving pages to file:', error);
    }
  }

  async fetchExtensionData(url) {
    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      // Extract all necessary data from the page based on the specified selectors
      const extensionData = await page.evaluate((pageUrl) => {
        // Function to safely extract text from a selector
        const getText = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };
        
        // Function to safely extract number from text
        const getNumber = (selector) => {
          const text = getText(selector);
          return text ? parseInt(text.replace(/[^0-9]/g, '')) : 0;
        };
        
        // Function to extract array of items
        const getArray = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.textContent.trim());
        };
        
        // Extract identifier from URL or page
        const getIdentifier = () => {
          const url = window.location.href;
          const match = url.match(/itemName=([^&]+)/);
          return match ? match[1] : '';
        };
        
        return {
          name: getText('h1[itemprop="name"]') || getText('.ux-item-name'),
          identifier: getIdentifier(),
          description: getText('.ux-item-shortdesc') || getText('.ux-item-description'),
          version: getText('.ux-item-meta-version') || getText('#version + td'),
          author: getText('.ux-item-publisher') || getText('#publisher + td'),
          url: pageUrl,
          downloads: getNumber('.ux-item-meta-installs') || getNumber('.installs'),
          installs: getNumber('.installs-text') || getNumber('.installs'),
          last_updated: getText('.extension-last-updated-date') || getText('#last-updated + td'),
          categories: getArray('.meta-data-list-link'),
          rating: parseFloat(getText('.ux-item-rating-count') || getText('.rating')) || 0,
          reviewCount: $(".ux-item-rating-count span").first().text().trim(),
          tags: getArray('.meta-data-list'),
          repository: getText('.ux-repository'),
          licenseUrl : $('.ux-section-resources a').filter((_, el) => $(el).text().trim() === "License").attr("href")
        };
      }, url);
      
      await page.close();
      return extensionData;
    } catch (error) {
      console.error(`❌ Fayllarni saqlashda xatolik: ${url}`, error);
      return null;
    }
  }

  async fetchPageContent(url) {
    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      const htmlContent = await page.evaluate(() => document.documentElement.outerHTML);
      await page.close();
      return htmlContent;
    } catch (error) {
      console.error(`❌ Fayllarni saqlashda xatolik: ${url}`, error);
      return null;
    }
  }

  async saveToDatabase(extensionData, localPath) {
    try {
      const Extension = require('../database/models/Extension');
      
      // Convert last_updated string to timestamp if possible
      let lastUpdated = null;
      if (extensionData.last_updated) {
        try {
          lastUpdated = new Date(extensionData.last_updated);
          if (isNaN(lastUpdated.getTime())) {
            lastUpdated = null; // Set to null if parsing fails
          }
        } catch (e) {
          lastUpdated = null;
        }
      }
      
      // Prepare data for SQLite
      const data = {
        name: extensionData.name || null,
        identifier: extensionData.identifier || null,
        description: extensionData.description || null,
        version: extensionData.version || null,
        author: extensionData.author || null,
        url: extensionData.url || null,
        downloads: extensionData.downloads || null,
        installs: extensionData.installs || null,
        last_updated: lastUpdated,
        categories: extensionData.categories && extensionData.categories.length > 0 ? extensionData.categories : null,
        rating: extensionData.rating || null,
        review_count: extensionData.review_count || null,
        tags: extensionData.tags && extensionData.tags.length > 0 ? extensionData.tags : null,
        repository: extensionData.repository || null,
        license: extensionData.license || null,
        local_path: localPath || null
      };
      
      // Ensure identifier is not null (required field)
      if (!data.identifier) {
        console.error(`❌ Identifier is missing for extension: ${extensionData.name}`);
        return null;
      }
      
      console.log('Attempting to save to SQLite:', data.name);
      
      // Insert or update data in SQLite
      const [extension, created] = await Extension.findOrCreate({
        where: { identifier: data.identifier },
        defaults: data
      });
      
      // If the record already exists, update it
      if (!created) {
        await extension.update(data);
      }
      
      console.log(`✅ ${extensionData.name} ma'lumotlari SQLite bazasiga saqlandi`);
      return extension;
    } catch (error) {
      console.error(`❌ SQLite bazasiga saqlashda xatolik:`, error);
      console.error('Error stack:', error?.stack);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = new ExtensionScraper();
