# HealthyPlate SA (test build 1.0)

A healthy meal-planning app for South Africa by Fusion Labs.

## What's inside
- Welcome screen and onboarding: goal, body details, diets, allergies, dislikes, cooking time, people, weekly budget and preferred stores
- Dashboard with a personal greeting, today's calorie ring, search, Surprise Me and Today's Meal Ideas
- 46 recipes (breakfast, lunch, supper, meal prep) with quantities, method, time, servings, calories, protein, carbs, fat and rand cost per serving
- Allergy safety: recipes containing your allergens are flagged in red and are never recommended
- Photo calorie scanner (AI estimate), with portion slider, allergen warning and food diary logging
- Weekly meal plan with auto-fill, a shopping list grouped by aisle with budget tracking, and "Where to buy" links for Checkers, Pick n Pay, Shoprite, Woolworths, Spar, Food Lover's and Makro
- Saved recipes, notes, profile editing, and a Premium screen (test mode, no payments)

All data is stored on the phone.

## Get the APK onto your phone (no coding needed)
1. Create a free account at **github.com**.
2. Tap **+ → New repository**, name it `healthyplate-sa`, choose **Private**, and tap **Create**.
3. On the new repository page, tap **uploading an existing file**. Unzip `HealthyPlateSA.zip` on a computer, then drag **everything inside the HealthyPlateSA folder** (including the hidden `.github` folder) into the page. Tap **Commit changes**.
   - Tip: on a Mac, press Cmd+Shift+. in Finder to show hidden folders. On Windows, turn on View → Hidden items.
   - If the `.github` folder won't upload: tap **Add file → Create new file**, type `.github/workflows/build-apk.yml` as the name, paste in the contents of `build-apk.yml` (included separately), and commit.
4. Open the **Actions** tab. A build named "Build HealthyPlate APK" starts automatically and takes about 4–6 minutes.
5. When it shows a green tick, open **Releases** (on the right side of the repository page). Download **HealthyPlateSA.apk** on your phone.
6. Open the file. If Android asks, allow **Install unknown apps** for your browser, then tap **Install**.

Alternative: open the folder in **Android Studio** and choose Build → Build APK(s).

## Photo scanner
**Camera:** tap **Scan → Open camera** for a live preview, then press the round button to take the photo. Android asks for camera permission the first time. If it was refused, the app explains how to allow it and offers **Open phone settings**. **Upload from gallery** always works too.

**AI food recognition:** photos are analysed by Claude (Anthropic).
1. Create an API key at console.anthropic.com and add some credit (each scan costs a fraction of a rand).
2. In the app, go to **Profile → Photo scanner**, paste the key, and tap **Test connection**. You should see ✅ Connected.

**Before a public launch,** deploy `server/scan-worker.js` (a free Cloudflare Worker, with steps in the file) so the key lives on a server, not in the app. Then paste the worker URL into **Fusion Labs scan server**.

## Updating the app
Test builds are signed with a fixed test key (`app/healthyplate-test.jks`), so each new APK installs over the previous one and keeps your data. For Google Play, create a separate private upload key and don't commit it.

## Notes
- Calorie and nutrition figures are estimates, not medical advice.
- Prices are typical South African estimates (Oct 2026); specials change weekly.
- To rename the app, change `app_name` in `app/src/main/res/values/strings.xml` and the text in `app/src/main/assets/www/`.
