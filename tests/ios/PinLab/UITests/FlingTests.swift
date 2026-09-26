import XCTest

/// Flings the lab page in Safari the way a thumb does: fast swipes both ways,
/// then slower drags, with pauses so each momentum scroll runs out. The page
/// is opened beforehand (xcrun simctl openurl) and the screen is recorded
/// around this test; tests/ios/measure.py reads the recording.
final class FlingTests: XCTestCase {
    func testFlings() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        sleep(4)
        let web = safari.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 10))
        for _ in 0..<3 {
            web.swipeUp(velocity: .fast)
            sleep(3)
            web.swipeDown(velocity: .fast)
            sleep(3)
        }
        let top = web.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.25))
        let bottom = web.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.75))
        for _ in 0..<3 {
            bottom.press(forDuration: 0.05, thenDragTo: top, withVelocity: .default, thenHoldForDuration: 0)
            sleep(3)
            top.press(forDuration: 0.05, thenDragTo: bottom, withVelocity: .default, thenHoldForDuration: 0)
            sleep(3)
        }
    }
}
