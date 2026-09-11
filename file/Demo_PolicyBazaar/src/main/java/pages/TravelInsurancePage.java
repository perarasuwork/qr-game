package pages;

import java.time.Duration;
import java.util.List;

import org.openqa.selenium.*;
import org.openqa.selenium.support.ui.*;

public class TravelInsurancePage {

    WebDriver driver;
    WebDriverWait wait;

    public TravelInsurancePage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(60));
    }

    public void clickTravelIcon() {

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//p[contains(text(),'Travel')]"))).click();
    }

    public void travelDetails(String search, String select) {

        WebElement input = wait.until(
                ExpectedConditions.visibilityOfElementLocated(
                        By.xpath("//input[@id='country']")));

        input.sendKeys(search);

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//li[contains(text(),'" + select + "')]"))).click();
    }

    public void selectTravelDates(String startDay, String endDay, String targetMonth) {

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//span[contains(text(),'Start date')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//span[contains(text(),'" + startDay + "')]"))).click();

        JavascriptExecutor js = (JavascriptExecutor) driver;

        for (int i = 0; i < 12; i++) {

            WebElement month = wait.until(
                    ExpectedConditions.visibilityOfElementLocated(
                            By.xpath("//h6")));

            if (month.getText().equalsIgnoreCase(targetMonth)) {
                break;
            }

            WebElement next = driver.findElement(
                    By.xpath("//button[@data-mui-test='next-arrow-button']"));

            js.executeScript("arguments[0].click();", next);
        }

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//span[contains(text(),'" + endDay + "')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//button[contains(text(),'Done') or contains(text(),'Continue')]"))).click();
    }

    public void selectTravelDetails(String travellers,
                                    String age1,
                                    String age2,
                                    String medical) {

        List<WebElement> travellerList =
                wait.until(ExpectedConditions.visibilityOfAllElementsLocatedBy(
                        By.xpath("//div[@class='memSelectRadioWrapper']//label")));

        for (WebElement traveller : travellerList) {

            if (traveller.getText().trim().equals(travellers)) {
                traveller.click();
                break;
            }
        }

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//div[contains(text(),'traveller 1')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//label[contains(text(),'" + age1 + "')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//div[contains(text(),'traveller 2')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//label[contains(text(),'" + age2 + "')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//label[contains(text(),'" + medical + "')]"))).click();

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//button[contains(text(),'Done')]"))).click();
    }

    public void expButton() {

        wait.until(ExpectedConditions.elementToBeClickable(
                By.xpath("//button[contains(text(),'Explore Plans')]"))).click();
    }
}