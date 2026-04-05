export interface PublicationSeed {
  title: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  itemTypeID: number;
  publicationTitle?: string;
  repository?: string;
  date?: string;
  creators: Array<{
    firstName?: string;
    lastName: string;
    creatorType: string;
  }>;
}

export const PUBLICATIONS = {
  gibbsDensitySurface: {
    title: 'Gibbs Density Surface of Fluid Argon: Revised Critical Parameters',
    doi: '10.1007/s10765-013-1411-5',
    itemTypeID: 1,
    date: '2013',
    creators: [
      {
        firstName: 'Leslie V.',
        lastName: 'Woodcock',
        creatorType: 'author',
      },
    ],
  } satisfies PublicationSeed,
  semiSupervisedLearning: {
    title: 'Semi-Supervised Learning with Deep Generative Models',
    doi: '10.29228/joh.67701',
    arxivId: '1406.5298',
    url: 'https://arxiv.org/abs/1406.5298',
    itemTypeID: 1,
    publicationTitle: 'arXiv',
    date: '2014',
    creators: [
      {
        firstName: 'Diederik P.',
        lastName: 'Kingma',
        creatorType: 'author',
      },
      {
        firstName: 'Danilo J.',
        lastName: 'Rezende',
        creatorType: 'author',
      },
    ],
  } satisfies PublicationSeed,
  infoGan: {
    title:
      'InfoGAN: Interpretable Representation Learning by Information Maximizing Generative Adversarial Nets',
    doi: '10.3726/978-3-653-03657-2/4',
    arxivId: '1606.03657',
    url: 'https://arxiv.org/abs/1606.03657',
    itemTypeID: 1,
    publicationTitle: 'arXiv',
    date: '2016',
    creators: [
      {
        firstName: 'Xi',
        lastName: 'Chen',
        creatorType: 'author',
      },
      {
        firstName: 'Yan',
        lastName: 'Duan',
        creatorType: 'author',
      },
    ],
  } satisfies PublicationSeed,
  enrichingWordVectors: {
    title: 'Enriching Word Vectors with Subword Information',
    doi: '10.1016/0022-4804(70)90064-8',
    itemTypeID: 1,
    date: '2017',
    creators: [
      {
        firstName: 'Piotr',
        lastName: 'Bojanowski',
        creatorType: 'author',
      },
    ],
  } satisfies PublicationSeed,
  dynamicWordEmbeddings: {
    title: 'Dynamic Word Embeddings',
    doi: '10.48550/arxiv.1702.08359',
    arxivId: '1702.08359',
    url: 'https://arxiv.org/abs/1702.08359',
    itemTypeID: 4,
    publicationTitle: '',
    repository: 'arXiv',
    date: '2017',
    creators: [
      {
        firstName: 'Robert',
        lastName: 'Bamler',
        creatorType: 'author',
      },
      {
        firstName: 'Stephan',
        lastName: 'Mandt',
        creatorType: 'author',
      },
    ],
  } satisfies PublicationSeed,
} as const;
