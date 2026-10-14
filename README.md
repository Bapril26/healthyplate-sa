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

## Turning on the photo scanner
The scanner sends the photo to Claude (Anthropic's AI) for a calorie estimate.
1. Create an API key at console.anthropic.com (each scan costs a fraction of a rand).
2. In the app, go to **Profile → Photo scanner** and paste the key.

Without a key, tap **try a demo result** on the Scan screen to see how it works.

**Before a public launch:** move the key onto a Fusion Labs server so it isn't stored in the app, and connect real Google Play billing for Premium.

## Notes
- Calorie and nutrition figures are estimates, not medical advice.
- Prices are typical South African estimates (Oct 2026); specials change weekly.
- To rename the app, change `app_name` in `app/src/main/res/values/strings.xml` and the text in `app/src/main/assets/www/`.
