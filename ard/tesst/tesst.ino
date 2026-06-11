#include <LiquidCrystal.h>

// Pins: RS, E, D4, D5, D6, D7
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
  lcd.print("LCD: Working!");
  lcd.setCursor(0, 1);
  lcd.print("Next: Check RTC");
}

void loop() {
  // Just staying still for the test
}