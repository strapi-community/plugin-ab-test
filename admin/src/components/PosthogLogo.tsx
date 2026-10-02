const stops: Array<[string, string, string, string, string, string]> = [
  // id, x1, x2, y, from, to
  ['p0', '21.96', '33.28', '9.62', '#ffd849', '#fbae01'],
  ['p1', '21.96', '33.28', '17.81', '#ffb700', '#f9aa01'],
  ['p2', '21.96', '31.03', '23.34', '#ff9500', '#f8aa00'],
  ['p3', '10.74', '21.96', '9.34', '#ff651e', '#e4400a'],
  ['p4', '10.74', '19.7', '23.34', '#c42c00', '#d63600'],
  ['p5', '10.74', '21.96', '17.58', '#ef3c00', '#d63601'],
  ['p6', '0', '10.74', '9.34', '#3f80ff', '#084fe0'],
  ['p7', '0', '10.74', '17.75', '#0255ff', '#0145d2'],
  ['p8', '0', '9.19', '23.11', '#0041c6', '#0045d0'],
];

const fill = (id: string) => `url(#ab-test-posthog-${id})`;

/**
 * The PostHog logo mark, from PostHog's brand assets. Its head is near black: show it on a
 * light surface, whatever the theme of the admin panel.
 */
const PosthogLogo = ({ width = 52 }: { width?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={(width * 28) / 52}
    viewBox="0 0 52 28"
    aria-hidden="true"
  >
    <path fill={fill('p6')} d="M10.74 7.16 4.54.8A2.66 2.66 0 0 0 0 2.66V7.5l10.74 11.18z" />
    <path fill={fill('p7')} d="M9.19 28h1.55v-9.32L0 7.5v10.73z" />
    <path fill={fill('p8')} d="M0 25.41A2.6 2.6 0 0 0 2.58 28H9.2L0 18.23z" />
    <path fill={fill('p3')} d="M10.74 2.66v4.5l11.22 11.52V7.63L15.3.8a2.66 2.66 0 0 0-4.56 1.86" />
    <path fill={fill('p4')} d="M10.74 28h8.96l-8.96-9.32z" />
    <path fill={fill('p5')} d="M10.74 7.16v11.52L19.7 28h2.26v-9.32z" />
    <path
      fill={fill('p0')}
      d="M21.96 2.67v4.96l11.3 11.6h.02V7.75L26.63.85a2.8 2.8 0 0 0-2-.85 2.67 2.67 0 0 0-2.67 2.67"
    />
    <path fill={fill('p1')} d="M21.96 7.63v11.05L31.03 28h2.25v-8.75z" />
    <path fill={fill('p2')} d="M21.96 28h9.07l-9.07-9.32z" />
    <path
      fill="#111"
      d="M51.66 25.22A1.9 1.9 0 0 0 50 23.33l-.34-.04c-1-.13-1.94-.6-2.65-1.33L33.28 7.75V28H49a2.66 2.66 0 0 0 2.67-2.67zM39.2 23.54h-.09a1.78 1.78 0 1 1 .1 0"
    />
    <defs>
      {stops.map(([id, x1, x2, y, from, to]) => (
        <linearGradient
          key={id}
          id={`ab-test-posthog-${id}`}
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      ))}
    </defs>
  </svg>
);

export { PosthogLogo };
