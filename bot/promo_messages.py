"""
promo_messages.py — Generates ready-to-paste promo messages for manual posting.

Run this script to get a fresh, varied message for each platform.
Copy-paste into the target group/forum — never send the same message twice.

Usage:
    python promo_messages.py
    python promo_messages.py --count 5    (generate 5 variations)
"""

import argparse
import pyperclip
from varied_messages import make_telegram_group_post, make_tweet, make_reddit_post

TELEGRAM_GROUPS = [
    "Crypto Signals groups",
    "Solana Gems / Solana New Coins groups",
    "Oil Trading / Energy groups",
    "Middle East News groups",
    "Geopolitics groups",
]


def print_section(title: str, content: str) -> None:
    width = 60
    print("\n" + "═" * width)
    print(f"  {title}")
    print("═" * width)
    print(content)
    print("─" * width)
    print(f"  Characters: {len(content)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate promo messages")
    parser.add_argument("--count", type=int, default=1, help="Number of variations")
    args = parser.parse_args()

    print("\n🌊 HORMUZ Promo Message Generator")
    print("Copy-paste these into your target platforms.\n")

    for i in range(args.count):
        if args.count > 1:
            print(f"\n{'─'*60}")
            print(f"  VARIATION {i + 1} of {args.count}")

        # Telegram group post
        tg_msg = make_telegram_group_post()
        print_section("TELEGRAM GROUP POST", tg_msg)

        # Suggested groups
        print("\n  Suggested groups to post in:")
        for group in TELEGRAM_GROUPS:
            print(f"    • {group}")

        # Tweet
        tweet = make_tweet(include_coin=(i % 2 == 0))
        print_section(f"TWITTER/X TWEET  ({len(tweet)}/280 chars)", tweet)

        # Reddit
        reddit = make_reddit_post()
        print_section("REDDIT TITLE", reddit["title"])
        print_section("REDDIT BODY", reddit["body"])

    print("\n✅ Done. Copy the message for your target platform and post manually.")
    print("   Wait at least 24 hours before posting in the same group again.\n")

    # Auto-copy the Telegram message to clipboard if only one variation
    if args.count == 1:
        try:
            tg_msg = make_telegram_group_post()
            pyperclip.copy(tg_msg)
            print("📋 Telegram message copied to clipboard.\n")
        except Exception:
            pass


if __name__ == "__main__":
    main()
