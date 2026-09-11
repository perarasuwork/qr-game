import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.testng.annotations.*;

import pages.HomePage;
import pages.TravelInsurancePage;

public class PolicyTest {

    WebDriver driver;

    @BeforeMethod
    public void setUp() {

        WebDriverManager.chromedriver().setup();

        ChromeOptions options = new ChromeOptions();
        options.addArguments("--disable-notifications");

        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
    }

    @Test
    public void travelInsuranceTest() {

        HomePage home = new HomePage(driver);
        home.openHomePage();

        TravelInsurancePage travel = new TravelInsurancePage(driver);

        travel.clickTravelIcon();

        travel.travelDetails(
                "Germany",
                "Germany"
        );

        travel.selectTravelDates(
                "10",
                "20",
                "December 2026"
        );

        travel.selectTravelDetails(
                "2",
                "22 years",
                "22 years",
                "No"
        );

        travel.expButton();
    }

    @AfterMethod
    public void tearDown() {

        if (driver != null) {
            driver.quit();
        }
    }
}