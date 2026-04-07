# TRR Measurement Matcher EXT

The purpose of this project is to improve the user experience of second-hand shoppers using the luxury consignment site TheRealReal.

Vintage sizing is notoriously inconsistent, especially for women. This extension enables shoppers to filter products according to clothing measurements rather than label size.

## What It Does

Measurement Matcher is a Chrome extension built to help shoppers browse resale listings with more confidence. Instead of relying on a tagged size like `S`, `M`, or `8`, the extension compares a shopper's saved waist and bust measurements against the measurements listed on product pages.

When a listing page is loaded, the extension:

- checks product measurements in the background
- filters the grid to show matching products first
- hides items outside the selected range
- can pull in matching products from later pages when the current page has no matches

## Why It Exists

Second-hand and vintage clothing often varies widely from modern sizing standards. Two garments with the same labeled size can fit very differently depending on the brand, decade, cut, or alterations. This project is meant to make online second-hand shopping more practical by centering real garment measurements instead of inconsistent labels.

## How It Works

Users enter:

- waist measurement
- bust measurement
- tolerance in inches

The extension stores those preferences, reads measurement details from supported product pages, and filters product grids based on whether an item falls within the shopper's preferred range.

## Project Goal

The goal of this project is to make resale shopping faster, less frustrating, and more accessible for people who need clothing to match their actual measurements, not just a nominal size tag. This is especially important for women outside of the standard size range, or with proportions that do match typical industry patterns. 

Eventually, we intend to expand Measurement Matcher compatibility to other popular sites. Please reach out to zfrazerklo@gmail.com for more information.
