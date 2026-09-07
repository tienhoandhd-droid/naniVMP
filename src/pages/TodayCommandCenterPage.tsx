// Load the Today presentation and its stylesheet together, only on navigation.
// Keep the data component CSS-free so its permission contracts remain testable.
import "../features/today/today.css";
export { default } from "../features/today/TodayCommandCenter.tsx";
