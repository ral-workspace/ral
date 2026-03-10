describe("Smoke", () => {
  it("should launch the app and show the main UI", async () => {
    // Splash screen should disappear
    const splash = await $("#splash");
    await splash.waitForExist({ timeout: 10000, reverse: true });

    // Main root element should be visible
    const root = await $("#root");
    await expect(root).toBeDisplayed();
  });
});
