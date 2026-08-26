import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext("D:/RvnCoba2/mbahna/pejatenkeren/worker/fb-profile", {
  headless: true, viewport: {width:1280,height:900}, locale: "id-ID",
});
const all = await ctx.cookies();
console.log("total cookie semua domain:", all.length);
console.log("nama cookie fb:", all.filter(c=>/facebook/.test(c.domain)).map(c=>c.name).join(", "));
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
await new Promise(r=>setTimeout(r,5000));
const info = await page.evaluate(()=>({
  arts: document.querySelectorAll('div[role="article"]').length,
  txt: document.body.innerText.slice(0,180).replace(/\n+/g," | "),
}));
console.log("beranda PC -> arts:", info.arts, "|", info.txt);
const s = await page.goto("https://www.facebook.com/search/posts?q=demo", { waitUntil:"domcontentloaded", timeout:45000 });
await new Promise(r=>setTimeout(r,5000));
const info2 = await page.evaluate(()=>({
  arts: document.querySelectorAll('div[role="article"]').length,
  txt: document.body.innerText.slice(0,120).replace(/\n+/g," | "),
}));
console.log("search PC  -> HTTP", s && s.status(), "arts:", info2.arts, "|", info2.txt);
await ctx.close();
