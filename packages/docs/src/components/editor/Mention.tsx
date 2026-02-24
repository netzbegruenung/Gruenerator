import { createReactInlineContentSpec } from '@blocknote/react';

export const Mention = createReactInlineContentSpec(
  {
    type: 'mention' as const,
    propSchema: {
      userId: { default: '' },
      userName: { default: 'Unbekannt' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <span className="bn-mention" data-user-id={props.inlineContent.props.userId}>
        @{props.inlineContent.props.userName}
      </span>
    ),
  }
);
