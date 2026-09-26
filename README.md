# TRR Measurement Matcher EXT

As a big fan of second-hand shopping and the luxury consignment site TheRealReal, I found myself constantly having to check product measurements, even when I filtered by size. I decided to build Measurement Matcher for my own personal use, inspired by sites like [Secondsense](https://secondsense.co/), who do a great service to the second-hand fashion community. Vintage sizing is notoriously inconsistent; The purpose of this project is to improve the user experience of second-hand shoppers by enabling shoppers to filter products according to clothing measurements rather than label size.

## What It Does

Measurement Matcher is a Chrome extension built to help shoppers browse resale listings with more confidence. Instead of relying on a tagged size like `S`, `M`, or `8`, the extension compares a shopper's saved waist and bust measurements against the measurements listed on product pages.

When a listing page is loaded, the extension:

- checks product measurements in the background
- filters the grid to show matching products first
- hides items outside the selected range
- can pull in matching products from later pages when the current page has no matches

## How It Works

Users enter:

- waist measurement
- bust measurement
- tolerance in inches

The extension stores those preferences, reads measurement details from supported product pages, and filters product grids based on whether an item falls within the shopper's preferred range.

**Development note**: I developed this as a personal project and used LLM assistance with the JavaScript implementation. The shopping problem, measurement-based matching criteria, and feature decisions came from my own experience using resale sites.

## Project Goal

The goal of this project is to make resale shopping faster, less frustrating, and more accessible for people who need clothing to match their actual measurements, not just a nominal size tag. This is especially important for women outside of the standard size range, or with proportions that do not match typical industry patterns. 

Eventually, I intend to expand Measurement Matcher compatibility to include other measurements and other popular sites. Please reach out to zfrazerklo@gmail.com for more information.
