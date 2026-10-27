import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  decodeText,
  fetchPublicUrl,
} from '@gitroom/nestjs-libraries/upload/public-url.fetch';

const MAX_PAGE_BYTES = 5 * 1024 * 1024;

function findDepth(element: Element) {
  let depth = 0;
  let elementer = element;
  while (elementer.parentNode) {
    depth++;
    // @ts-ignore
    elementer = elementer.parentNode;
  }
  return depth;
}

@Injectable()
export class ExtractContentService {
  async extractContent(url: string) {
    // URL arbitraria: SSRF-safe, com timeout e teto (antes fetch cru)
    const page = await fetchPublicUrl(url, {
      maxBytes: MAX_PAGE_BYTES,
      allowHttp: true,
    });
    const dom = new JSDOM(decodeText(page.buffer, page.contentType));

    // only element that has a title
    const allTitles = Array.from(dom.window.document.querySelectorAll('*'))
      .filter((f) => {
        return (
          f.querySelector('h1') ||
          f.querySelector('h2') ||
          f.querySelector('h3') ||
          f.querySelector('h4') ||
          f.querySelector('h5') ||
          f.querySelector('h6')
        );
      })
      .reverse();

    const findTheOneWithMostTitles = allTitles.reduce(
      (all, current) => {
        const depth = findDepth(current);
        const calculate = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce(
          (total, tag) => {
            if (current.querySelector(tag)) {
              return total + 1;
            }
            return total;
          },
          0
        );

        if (calculate > all.total) {
          return { total: calculate, depth, element: current };
        }

        if (depth > all.depth) {
          return { total: calculate, depth, element: current };
        }

        return all;
      },
      { total: 0, depth: 0, element: null as Element | null }
    );

    return findTheOneWithMostTitles?.element?.textContent
      ?.replace(/\n/g, ' ')
      .replace(/ {2,}/g, ' ');
    //
    // const allElements = Array.from(
    //   dom.window.document.querySelectorAll('*')
    // ).filter((f) => f.tagName !== 'SCRIPT');
    // const findIndex = allElements.findIndex((element) => {
    //   return (
    //     ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(
    //       element.tagName.toLowerCase()
    //     ) > -1
    //   );
    // });
    //
    // if (!findIndex) {
    //   return false;
    // }
    //
    // return allElements
    //   .slice(findIndex)
    //   .map((element) => element.textContent)
    //   .filter((f) => {
    //     const trim = f?.trim();
    //     return (trim?.length || 0) > 0 && trim !== '\n';
    //   })
    //   .map((f) => f?.trim())
    //   .join('')
    //   .replace(/\n/g, ' ')
    //   .replace(/ {2,}/g, ' ');
  }
}
