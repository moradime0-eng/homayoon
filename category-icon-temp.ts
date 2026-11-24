import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * ðŸŽ¨ CategoryIconComponent â€” Ù†Ù…Ø§ÛŒØ´ ÛŒÚ©Ù¾Ø§Ø±Ú†Ù‡Ù” Ø¢ÛŒÚ©ÙˆÙ† Ø¯Ø³ØªÙ‡â€ŒØ¨Ù†Ø¯ÛŒ Ø¯Ø± Ú©Ù„ Ù¾Ø±ÙˆÚ˜Ù‡
 * ============================================================
 * Ø§Ø² Ú†Ù‡Ø§Ø± Ù†ÙˆØ¹ Ø¢ÛŒÚ©ÙˆÙ† Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ Ù…ÛŒâ€ŒÚ©Ù†Ø¯:
 *  - `material` : Ø¢ÛŒÚ©ÙˆÙ†â€ŒÙ‡Ø§ÛŒ Material Icons (Ù¾ÛŒØ´â€ŒÙØ±Ø¶)
 *  - `emoji`    : Ø´Ú©Ù„Ú©â€ŒÙ‡Ø§ÛŒ ÛŒÙˆÙ†ÛŒÚ©Ø¯ (Ù…Ø«Ù„ ðŸŽ“ØŒ ðŸš€)
 *  - `google`   : Ø¢ÛŒÚ©ÙˆÙ†â€ŒÙ‡Ø§ÛŒ Google Fonts (Ù…Ø«Ù„ `home`ØŒ `school`)
 *  - `custom`   : ØªØµÙˆÛŒØ± Ø¢Ù¾Ù„ÙˆØ¯Ø´Ø¯Ù‡ (URL Ø¯Ø± `customIconUrl`)
 *
 * Ø§Ø³ØªÙØ§Ø¯Ù‡:
 * ```html
 * <app-category-icon [icon]="cat.icon" [iconType]="cat.iconType"
 *                    [customIconUrl]="cat.customIconUrl" [size]="28" />
 * ```
 * ============================================================
 */
@Component({
  selector: 'app-category-icon',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @switch (resolvedType) {
      @case ('emoji') {
        <span class="ci-emoji" [style.font-size.px]="size">{{ icon || 'ðŸ“' }}</span>
      }
      @case ('custom') {
        @if (customIconUrl) {
          <img
            class="ci-img"
            [src]="customIconUrl"
            [alt]="alt"
            [style.width.px]="size"
            [style.height.px]="size"
            loading="lazy"
          />
        } @else {
          <mat-icon [style.font-size.px]="size" [style.width.px]="size" [style.height.px]="size">
            category
          </mat-icon>
        }
      }
      @default {
        <!-- material Ùˆ google Ù‡Ø± Ø¯Ùˆ Ø¨Ø§ mat-icon Ø±Ù†Ø¯Ø± Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯ -->
        <mat-icon [style.font-size.px]="size" [style.width.px]="size" [style.height.px]="size">
          {{ icon || fallback }}
        </mat-icon>
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .ci-emoji {
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .ci-img {
        object-fit: contain;
        display: block;
      }
      mat-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: inherit;
      }
    `,
  ],
})
export class CategoryIconComponent {
  /** Ù†Ø§Ù… Ø¢ÛŒÚ©ÙˆÙ† (material/google) ÛŒØ§ Ú©Ø§Ø±Ø§Ú©ØªØ± emoji */
  @Input() icon?: string;
  /** Ù†ÙˆØ¹ Ø¢ÛŒÚ©ÙˆÙ† */
  @Input() iconType?: 'material' | 'emoji' | 'google' | 'custom';
  /** Ø¢Ø¯Ø±Ø³ ØªØµÙˆÛŒØ± Ø¢ÛŒÚ©ÙˆÙ† Ø³ÙØ§Ø±Ø´ÛŒ */
  @Input() customIconUrl?: string;
  /** Ø§Ù†Ø¯Ø§Ø²Ù‡Ù” Ø¢ÛŒÚ©ÙˆÙ† Ø¨Ù‡ Ù¾ÛŒÚ©Ø³Ù„ */
  @Input() size = 24;
  /** Ù…ØªÙ† Ø¬Ø§ÛŒÚ¯Ø²ÛŒÙ† ØªØµÙˆÛŒØ± */
  @Input() alt = 'Ø¢ÛŒÚ©ÙˆÙ† Ø¯Ø³ØªÙ‡â€ŒØ¨Ù†Ø¯ÛŒ';
  /** Ø¢ÛŒÚ©ÙˆÙ† Ù¾ÛŒØ´â€ŒÙØ±Ø¶ Ø¯Ø± ØµÙˆØ±Øª Ø®Ø§Ù„ÛŒ Ø¨ÙˆØ¯Ù† */
  @Input() fallback = 'category';

  /** Ù†ÙˆØ¹ Ù†Ù‡Ø§ÛŒÛŒ â€” Ø§Ú¯Ø± Ù†ÙˆØ¹ Ù…Ø´Ø®Øµ Ù†Ø¨Ø§Ø´Ø¯ØŒ Ø¨Ù‡â€ŒØµÙˆØ±Øª Ù‡ÙˆØ´Ù…Ù†Ø¯ ØªØ´Ø®ÛŒØµ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯ */
  get resolvedType(): 'material' | 'emoji' | 'google' | 'custom' {
    const type = this.iconType;
    if (type) return type;
    // ØªØ´Ø®ÛŒØµ Ø®ÙˆØ¯Ú©Ø§Ø±: Ø§Ú¯Ø± customIconUrl Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ø´Ø¯ â†’ custom
    if (this.customIconUrl) return 'custom';
    // Ø§Ú¯Ø± Ø¢ÛŒÚ©ÙˆÙ† ÛŒÚ© Ú©Ø§Ø±Ø§Ú©ØªØ± ØºÛŒØ±-ASCII Ø¨Ø§Ø´Ø¯ â†’ emoji
    if (this.icon && this.isEmoji(this.icon)) return 'emoji';
    return 'material';
  }

  private isEmoji(value: string): boolean {
    // ØªØ´Ø®ÛŒØµ Ø³Ø§Ø¯Ù‡Ù” Ø´Ú©Ù„Ú©: Ø´Ø§Ù…Ù„ Ú©Ø§Ø±Ø§Ú©ØªØ±Ù‡Ø§ÛŒ Ø®Ø§Ø±Ø¬ Ø§Ø² Ù…Ø­Ø¯ÙˆØ¯Ù‡Ù” ASCII
    return /\p{Extended_Pictographic}/u.test(value);
  }
}
