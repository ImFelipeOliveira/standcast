import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import SupportEmail from './SupportEmail.vue';
import './fonts.css';
import './brand.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SupportEmail', SupportEmail);
  },
} satisfies Theme;
